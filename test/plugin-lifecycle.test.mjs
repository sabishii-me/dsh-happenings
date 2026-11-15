import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ensureBackend, killTree} from '../plugin/lib/lifecycle.js';

const okBody = JSON.stringify({ok:true, service:'happenings'});

async function fakeBackend(port = 0) {
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      response.writeHead(200, {'content-type':'application/json'});
      response.end(okBody);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {server, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve))};
}

test('reuses a healthy backend and starts nothing', async () => {
  const backend = await fakeBackend();
  try {
    const handle = await ensureBackend({port: backend.port});
    assert.equal(handle.owned, false);
    assert.deepEqual(handle.started, []);
    assert.deepEqual(handle.errors, []);
  } finally {
    await backend.close();
  }
});

test('reports actionable errors instead of hanging when it cannot start', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'happenings-lifecycle-'));
  const handle = await ensureBackend({
    port: 9,
    siteDir: dir,
    wranglerBin: path.join(dir, 'missing-wrangler.js'),
    logDir: path.join(dir, 'logs'),
  });
  assert.equal(handle.owned, false);
  assert.equal(handle.started.length, 0);
  assert.match(handle.errors.join(' '), /wrangler not installed/u);
  assert.equal(existsSync(path.join(dir, 'logs')), false);
});

test('explains how to point at the site when the checkout is missing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'happenings-nosite-'));
  writeFileSync(path.join(dir, 'fake-wrangler.js'), '');
  const handle = await ensureBackend({
    port: 9,
    siteDir: dir,
    wranglerBin: path.join(dir, 'fake-wrangler.js'),
    logDir: path.join(dir, 'logs'),
  });
  assert.equal(handle.owned, false);
  assert.match(handle.errors.join(' '), /site checkout not found/u);
});

test('starts a missing backend detached, waits for health, and stops only what it started', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'happenings-lifecycle-'));
  writeFileSync(path.join(dir, 'fake-wrangler.js'), `
    const {createServer} = require('node:http');
    const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
    createServer((request, response) => {
      if (request.url === '/api/health') { response.writeHead(200, {'content-type':'application/json'}); response.end(${JSON.stringify(okBody)}); return; }
      response.writeHead(404).end();
    }).listen(port, '127.0.0.1');
  `);
  // The lifecycle refuses to start without a built site, so give it one.
  const {mkdirSync} = await import('node:fs');
  mkdirSync(path.join(dir, 'dist'), {recursive: true});
  writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>');

  const port = 18000 + Math.floor(Math.random() * 2000);
  const handle = await ensureBackend({
    port,
    siteDir: dir,
    wranglerBin: path.join(dir, 'fake-wrangler.js'),
    persistDir: path.join(dir, '.wrangler', 'state'),
    logDir: path.join(dir, 'logs'),
    startTimeoutMs: 15_000,
  });

  assert.equal(handle.owned, true);
  assert.equal(handle.errors.length, 0);
  assert.equal(handle.started.length, 1);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
  assert.equal(health.service, 'happenings');

  handle.stop();
  handle.stop(); // idempotent
  for (const pid of handle.started) {
    assert.doesNotThrow(() => process.kill(pid, 0), 'kill was requested; the process may linger briefly on Windows');
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`).then(() => null), /fetch failed/u);
});

test('killTree never throws for a pid that is already gone', () => {
  assert.doesNotThrow(() => killTree(999999));
});
