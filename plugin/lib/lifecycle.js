import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');

/**
 * Installed plugins live in the profile's node_modules, so the site checkout is
 * NOT the parent of the plugin directory any more. Detect it instead: the repo
 * checkout (sibling of plugin/), a `site/` subdir, or the current working dir.
 */
export function findSiteDir(from = pluginRoot) {
  const candidates = [
    process.env.HAPPENINGS_SITE_DIR,
    path.resolve(from, '..'),
    path.resolve(from, '..', 'site'),
    process.cwd(),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'wrangler.jsonc')) && existsSync(path.join(candidate, 'dist', 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

/** Where the local Worker runtime lives; env overrides win, like Sonar. */
export function defaults(overrides = {}) {
  const siteDir = overrides.siteDir ?? process.env.HAPPENINGS_SITE_DIR ?? findSiteDir();
  const base = siteDir ?? pluginRoot;
  return {
    port: Number(process.env.HAPPENINGS_PORT || 8790),
    host: '127.0.0.1',
    siteDir,
    wranglerBin: process.env.HAPPENINGS_WRANGLER || path.join(base, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    persistDir: process.env.HAPPENINGS_PERSIST || path.join(base, '.wrangler', 'state'),
    logDir: process.env.HAPPENINGS_LOG_DIR || path.join(base, '.runtime'),
    startTimeoutMs: Number(process.env.HAPPENINGS_START_TIMEOUT || 90_000),
    ...overrides,
  };
}

export function backendUrl(config) {
  return `http://${config.host}:${config.port}`;
}

async function healthy(url, timeout = 800) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null);
    return body?.ok === true && body?.service === 'happenings';
  } catch {
    return false;
  }
}

async function waitFor(url, timeoutMs, sleep) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await healthy(url, 700)) return true;
    await sleep(500);
  }
  return false;
}

function logFile(dir, name) {
  mkdirSync(dir, { recursive: true });
  return openSync(path.join(dir, `happenings-${name}.log`), 'a');
}

/** Windows keeps the workerd grandchild alive unless the whole tree is killed. */
export function killTree(pid) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
}

/**
 * Make the backend available for the panel: reuse a healthy one (the user may
 * already run `npm run preview`), otherwise start `wrangler dev` detached and
 * wait for /api/health. Only processes started here are stopped on dispose.
 */
export async function ensureBackend(options = {}) {
  const config = defaults(options);
  const url = backendUrl(config);
  const healthUrl = `${url}/api/health`;
  const started = [];
  const errors = [];
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  if (await healthy(healthUrl)) {
    return { url, owned: false, started, errors, stop() {} };
  }

  if (!existsSync(config.wranglerBin)) {
    errors.push(`wrangler not installed at ${config.wranglerBin} — run npm install in the site checkout`);
    return { url, owned: false, started, errors, stop() {} };
  }
  if (!config.siteDir || !existsSync(path.join(config.siteDir, 'dist', 'index.html'))) {
    errors.push(
      "site checkout not found — set HAPPENINGS_SITE_DIR or the plugin's siteDir config to the repository checkout, or point backendUrl at a deployed site",
    );
    return { url, owned: false, started, errors, stop() {} };
  }

  const out = logFile(config.logDir, 'worker');
  // workerd cannot write outside the repo on this host, so keep temp/cache local.
  const env = {
    ...process.env,
    TMP: path.join(config.siteDir, '.wrangler', 'tmp'),
    TEMP: path.join(config.siteDir, '.wrangler', 'tmp'),
    XDG_CONFIG_HOME: path.join(config.siteDir, '.wrangler', 'xdg'),
    XDG_CACHE_HOME: path.join(config.siteDir, '.wrangler', 'xdg', 'cache'),
  };

  const child = spawn(
    process.execPath,
    [config.wranglerBin, 'dev', '--port', String(config.port), '--persist-to', config.persistDir],
    { cwd: config.siteDir, detached: true, stdio: ['ignore', out, out], windowsHide: true, env },
  );
  child.unref();
  if (child.pid) started.push(child.pid);

  const ready = await waitFor(healthUrl, config.startTimeoutMs, sleep);
  if (!ready) errors.push(`backend did not become healthy within ${config.startTimeoutMs}ms — see ${config.logDir}`);

  let stopped = false;
  return {
    url,
    owned: true,
    started,
    errors,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const pid of started) killTree(pid);
    },
  };
}
