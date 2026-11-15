import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { ensureBackend, backendUrl, defaults } from './lib/lifecycle.js';

export const name = 'dsh-happenings';
const PREFIX = '/dsh-happenings';
const WEB_ROOT = fileURLToPath(new URL('./web/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(body));
}

function sameOrigin(request) {
  const headers = request.headers;
  if (headers['sec-fetch-site'] && !['same-origin', 'none'].includes(headers['sec-fetch-site'])) return false;
  const source = headers.origin || headers.referer;
  if (!source) return true; // Non-browser clients need not send Origin.
  try {
    const expected = new URL(`${request.socket?.encrypted ? 'https' : 'http'}://${headers.host}`);
    return new URL(source).origin === expected.origin;
  } catch { return false; }
}

// Snapshot only known regular assets. No request path is ever used as a disk path,
// and symlinks (including directory links) are never followed.
function assets(root) {
  const result = [];
  if (!root) return result;
  try { if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return result; }
  catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  function visit(directory, parts = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      const next = [...parts, entry.name];
      if (entry.isDirectory()) visit(path, next);
      else if (entry.isFile() && MIME[extname(entry.name).toLowerCase()]) {
        result.push({ path: next.map(encodeURIComponent).join('/'), type: MIME[extname(entry.name).toLowerCase()], body: readFileSync(path) });
      }
    }
  }
  visit(root);
  return result;
}

/** Register exact host routes; the optional asset root supports isolated tests. */
export function mountRoutes(host, config = {}, { webRoot = WEB_ROOT } = {}) {
  const disposers = [];
  const active = new Set();
  let disposed = false;
  const register = (path, handler) => disposers.push(host.webServer.register({ kind: 'exact', path, handler }));
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const controller of active) controller.abort();
    for (const disposer of disposers.reverse()) disposer();
  };
  const timeoutMs = Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs > 0
    ? Math.min(config.requestTimeoutMs, 120_000) : 15_000;
  try {
    for (const asset of assets(webRoot)) {
      const handler = (request, response) => {
        if (!['GET', 'HEAD'].includes(request.method)) {
          response.writeHead(405, { allow: 'GET, HEAD' }); response.end(); return;
        }
        response.writeHead(200, { 'content-type': asset.type, 'content-length': asset.body.length, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : asset.body);
      };
      register(`${PREFIX}/app/${asset.path}`, handler);
      if (asset.path === 'index.html') register(`${PREFIX}/app/`, handler);
    }
    for (const endpoint of ['health', 'events', 'meta', 'refresh', 'ics', 'export']) {
      const method = endpoint === 'refresh' ? 'POST' : 'GET';
      register(`${PREFIX}/api/${endpoint}`, async (request, response) => {
        if (request.method !== method) {
          response.writeHead(405, { allow: method }); response.end(); return;
        }
        if (method === 'POST' && !sameOrigin(request)) {
          json(response, 403, { error: 'cross-origin mutation refused' }); return;
        }
        const controller = new AbortController();
        active.add(controller);
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          if (disposed) throw new Error('disposed');
          const backend = new URL(config.backendUrl || process.env.HAPPENINGS_BACKEND_URL || 'http://127.0.0.1:8790');
          if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password) throw new Error('invalid backend');
          // Explicit endpoint selection prevents open proxying, even with a forged request URL.
          const target = new URL(`/api/${endpoint}`, backend);
          target.search = new URL(request.url || '/', 'http://localhost').search;
          const headers = { accept: request.headers.accept || '*/*' };
          if (endpoint === 'refresh' && config.adminToken) headers['x-admin-token'] = String(config.adminToken);
          // Refresh takes query parameters only; browser cookies, credentials and bodies are not forwarded.
          const upstream = await fetch(target, { method, headers, signal: controller.signal, redirect: 'error' });
          const body = Buffer.from(await upstream.arrayBuffer());
          const responseHeaders = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
          for (const key of ['content-type', 'content-disposition']) {
            const value = upstream.headers.get(key);
            if (value) responseHeaders[key] = value;
          }
          response.writeHead(upstream.status, responseHeaders);
          response.end(body);
        } catch {
          json(response, 503, { error: 'Happenings backend unavailable' });
        } finally {
          clearTimeout(timer);
          active.delete(controller);
        }
      });
    }
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Backend options from the plugin row; undefined values must not clobber defaults. */
export function backendOptions(config = {}) {
  const options = {};
  const port = Number(config.port);
  if (Number.isFinite(port) && port > 0) options.port = port;
  if (config.dataDir) options.dataDir = String(config.dataDir);
  if (config.dbPath) options.dbPath = String(config.dbPath);
  if (config.adminToken) options.adminToken = String(config.adminToken);
  return options;
}

/** Auto-start only for the local backend; a deployed URL is someone else's job. */
export function shouldAutoStart(config = {}) {
  if (config.autoStart === false) return false;
  const local = backendUrl(defaults(backendOptions(config)));
  const target = config.backendUrl || local;
  return target.replace(/\/$/u, '') === local;
}

export function apply(ctx, config = {}) {
  return ctx.inject(['webServer'], host => {
    host.effect(() => mountRoutes(host, config), 'dsh-happenings: routes');
    if (!shouldAutoStart(config)) return;
    host.effect(() => {
      let handle = null;
      let disposed = false;
      ensureBackend(backendOptions(config)).then(
        (result) => {
          handle = result;
          for (const error of result.errors) console.warn(`[dsh-happenings] ${error}`);
          if (result.owned) console.info(`[dsh-happenings] backend started at ${result.url} (pid ${result.started.join(',')})`);
          if (disposed) result.stop();
        },
        (error) => console.warn(`[dsh-happenings] backend start failed: ${error?.message || error}`),
      );
      return () => {
        disposed = true;
        handle?.stop();
      };
    }, 'dsh-happenings: backend lifecycle');
  });
}
