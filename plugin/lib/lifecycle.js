import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');

/**
 * The plugin ships its own Node server and SQLite database. No Wrangler,
 * Workerd, site checkout or Cloudflare account is required.
 */
export function defaults(overrides = {}) {
  const dataDir = overrides.dataDir ?? process.env.HAPPENINGS_DATA_DIR ?? path.join(homedir(), '.dsh', 'happenings');
  return {
    port: Number(process.env.HAPPENINGS_PORT || 8790),
    host: '127.0.0.1',
    dataDir,
    dbPath: overrides.dbPath ?? process.env.HAPPENINGS_DB ?? path.join(dataDir, 'happenings.db'),
    serverEntry: process.env.HAPPENINGS_SERVER || path.join(pluginRoot, 'server.mjs'),
    logDir: process.env.HAPPENINGS_LOG_DIR || path.join(dataDir, 'logs'),
    startTimeoutMs: Number(process.env.HAPPENINGS_START_TIMEOUT || 30_000),
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

/** Windows keeps child processes alive unless the whole tree is killed. */
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
 * Make the local API available for the panel: reuse a healthy one, otherwise
 * start the bundled Node server detached and wait for /api/health. Only
 * processes started here are stopped on dispose.
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

  if (!existsSync(config.serverEntry)) {
    errors.push(`server entry not found at ${config.serverEntry} — reinstall the plugin`);
    return { url, owned: false, started, errors, stop() {} };
  }

  const out = logFile(config.logDir, 'backend');
  const env = {
    ...process.env,
    HAPPENINGS_PORT: String(config.port),
    HAPPENINGS_DATA_DIR: config.dataDir,
    HAPPENINGS_DB: config.dbPath,
  };
  if (config.adminToken) env.HAPPENINGS_ADMIN_TOKEN = String(config.adminToken);

  const child = spawn(process.execPath, [config.serverEntry], {
    cwd: pluginRoot,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
    env,
  });
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
