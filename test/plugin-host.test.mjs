import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, mountRoutes } from '../plugin/index.js';

function mockHost() {
  const routes = new Map();
  let removed = 0;
  return { routes, get removed() { return removed; }, webServer: { register(route) {
    assert.equal(route.kind, 'exact');
    assert.ok(!routes.has(route.path));
    routes.set(route.path, route.handler);
    return () => { removed++; routes.delete(route.path); };
  } } };
}
async function invoke(host, path, { method = 'GET', headers = {}, url = path } = {}) {
  const handler = host.routes.get(path);
  assert.ok(handler, `route registered: ${path}`);
  const result = { status: 0, headers: {}, body: '' };
  await handler({ method, url, headers: { host: 'localhost:3080', ...headers }, socket: {} }, {
    writeHead(status, responseHeaders) { result.status = status; result.headers = responseHeaders; },
    end(body) { result.body = body === undefined ? '' : body.toString(); },
  });
  return result;
}
async function upstream(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const api = endpoint => `/dsh-happenings/api/${endpoint}`;

test('explicit proxy routes preserve queries, status, data, and safe headers', async t => {
  const seen = [];
  const backendUrl = await upstream(t, (req, res) => {
    seen.push({ url: req.url, method: req.method, headers: req.headers });
    res.writeHead(req.url.startsWith('/api/meta') ? 409 : 200, {
      'content-type': req.url.startsWith('/api/ics') ? 'text/calendar' : 'application/json',
      'content-disposition': 'inline; filename="happenings.ics"',
      'set-cookie': 'upstream=secret',
    });
    res.end(JSON.stringify({ url: req.url }));
  });
  const host = mockHost();
  const dispose = mountRoutes(host, { backendUrl, adminToken: 'private-token' }, { webRoot: null });
  t.after(dispose);
  assert.equal(host.routes.size, 6);
  for (const endpoint of ['health', 'events', 'meta', 'ics', 'export']) {
    const result = await invoke(host, api(endpoint), { url: `${api(endpoint)}?from=2026-01-01&topics=ai%2Cgames`, headers: { cookie: 'secret=1', authorization: 'Bearer browser', 'x-admin-token': 'browser-token' } });
    assert.equal(result.status, endpoint === 'meta' ? 409 : 200);
    assert.equal(JSON.parse(result.body).url, `/api/${endpoint}?from=2026-01-01&topics=ai%2Cgames`);
    assert.equal(result.headers['set-cookie'], undefined);
    if (endpoint === 'ics') assert.equal(result.headers['content-type'], 'text/calendar');
  }
  const result = await invoke(host, api('refresh'), { method: 'POST', headers: { origin: 'http://localhost:3080' } });
  assert.equal(result.status, 200);
  for (const request of seen.slice(0, -1)) {
    assert.equal(request.headers['x-admin-token'], undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
  }
  assert.equal(seen.at(-1).headers['x-admin-token'], 'private-token');
  assert.equal(seen.at(-1).method, 'POST');
  assert.ok(!host.routes.has(api('events/123')));
  dispose();
  dispose();
  assert.equal(host.routes.size, 0);
  assert.equal(host.removed, 6);
});

test('method allowlists and cross-origin mutation checks reject before upstream', async t => {
  let calls = 0;
  const backendUrl = await upstream(t, (_req, res) => { calls++; res.end('{}'); });
  const host = mockHost();
  t.after(mountRoutes(host, { backendUrl }, { webRoot: null }));
  for (const endpoint of ['health', 'events', 'meta', 'ics', 'export']) {
    const result = await invoke(host, api(endpoint), { method: 'POST' });
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'GET');
  }
  assert.equal((await invoke(host, api('refresh'))).status, 405);
  for (const headers of [{ origin: 'https://evil.test' }, { origin: 'null' }, { referer: 'http://evil.test/' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'https://localhost:3080' }]) {
    assert.equal((await invoke(host, api('refresh'), { method: 'POST', headers })).status, 403);
  }
  assert.equal(calls, 0);
});

test('timeouts, connection failures, bad URLs and redirects return safe JSON 503', async t => {
  const backendUrl = await upstream(t, (req, res) => {
    if (req.url === '/api/meta') { res.writeHead(302, { location: 'http://example.invalid/' }); res.end(); }
    else if (req.url === '/api/events') req.socket.destroy();
    // health intentionally stalls until timeout/disposal.
  });
  const host = mockHost();
  t.after(mountRoutes(host, { backendUrl, requestTimeoutMs: 40, adminToken: 'secret-token' }, { webRoot: null }));
  for (const endpoint of ['health', 'meta', 'events']) {
    const result = await invoke(host, api(endpoint));
    assert.equal(result.status, 503);
    assert.deepEqual(JSON.parse(result.body), { error: 'Happenings backend unavailable' });
  }
  const invalid = mockHost();
  t.after(mountRoutes(invalid, { backendUrl: 'file:///private' }, { webRoot: null }));
  assert.equal((await invoke(invalid, api('health'))).status, 503);
});

test('static assets are snapshotted, exact, MIME typed, and disposed', async t => {
  const root = await mkdtemp(join(tmpdir(), 'happenings-host-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<html>calendar</html>');
  await writeFile(join(root, 'assets', 'app.js'), 'console.log("calendar")');
  await writeFile(join(root, 'assets', 'app.css'), 'body{color:red}');
  await writeFile(join(root, '.secret.json'), '{"secret":true}');
  await writeFile(join(root, 'private.env'), 'SECRET=1');
  const host = mockHost();
  const dispose = mountRoutes(host, {}, { webRoot: root });
  t.after(dispose);
  assert.equal(host.routes.size, 10);
  for (const [path, type, body] of [
    ['/dsh-happenings/app/', 'text/html; charset=utf-8', '<html>calendar</html>'],
    ['/dsh-happenings/app/index.html', 'text/html; charset=utf-8', '<html>calendar</html>'],
    ['/dsh-happenings/app/assets/app.js', 'text/javascript; charset=utf-8', 'console.log("calendar")'],
    ['/dsh-happenings/app/assets/app.css', 'text/css; charset=utf-8', 'body{color:red}'],
  ]) {
    const result = await invoke(host, path);
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-type'], type);
    assert.equal(result.body, body);
    assert.equal((await invoke(host, path, { method: 'HEAD' })).body, '');
    assert.equal((await invoke(host, path, { method: 'POST' })).status, 405);
  }
  for (const path of ['../index.js', '%2e%2e/index.js', 'missing.js', '.secret.json', 'private.env']) assert.ok(!host.routes.has(`/dsh-happenings/app/${path}`));
  await writeFile(join(root, 'late.js'), 'late');
  assert.ok(!host.routes.has('/dsh-happenings/app/late.js'));
  dispose();
  assert.equal(host.removed, 10);
  assert.equal(host.routes.size, 0);
});

test('environment backend fallback and explicit config precedence', async t => {
  const backendUrl = await upstream(t, (_req, res) => res.end('environment'));
  const previous = process.env.HAPPENINGS_BACKEND_URL;
  process.env.HAPPENINGS_BACKEND_URL = backendUrl;
  t.after(() => { if (previous === undefined) delete process.env.HAPPENINGS_BACKEND_URL; else process.env.HAPPENINGS_BACKEND_URL = previous; });
  const host = mockHost();
  t.after(mountRoutes(host, {}, { webRoot: null }));
  assert.equal((await invoke(host, api('health'))).body, 'environment');
  const explicit = mockHost();
  t.after(mountRoutes(explicit, { backendUrl: 'invalid' }, { webRoot: null }));
  assert.equal((await invoke(explicit, api('health'))).status, 503);
});

test('disposal aborts pending proxies and failed mounting rolls back registrations', async t => {
  let started;
  const received = new Promise(resolve => { started = resolve; });
  const backendUrl = await upstream(t, () => started());
  const host = mockHost();
  const dispose = mountRoutes(host, { backendUrl }, { webRoot: null });
  const pending = invoke(host, api('health'));
  await received;
  dispose();
  assert.equal((await pending).status, 503);
  assert.equal(host.routes.size, 0);
  const broken = mockHost();
  const register = broken.webServer.register;
  broken.webServer.register = route => {
    if (route.path === api('meta')) throw new Error('registration failed');
    return register(route);
  };
  assert.throws(() => mountRoutes(broken, {}, { webRoot: null }), /registration failed/);
  assert.equal(broken.routes.size, 0);
  assert.equal(broken.removed, 2);
});

test('apply waits for webServer injection and owns cleanup through effect', () => {
  const host = mockHost();
  const disposers = [];
  host.effect = (setup) => { const dispose = setup(); disposers.push(dispose); return dispose; };
  let injected;
  apply({ inject(services, callback) { assert.deepEqual(services, ['webServer']); injected = callback; } }, { autoStart: false });
  assert.equal(host.routes.size, 0);
  injected(host);
  assert.ok(host.routes.has(api('health')));
  for (const dispose of disposers.reverse()) dispose();
  assert.equal(host.routes.size, 0);
});
