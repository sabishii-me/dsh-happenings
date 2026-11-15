import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import api from './lib/api.mjs';
import { openDatabase } from './lib/sqlite-d1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.HAPPENINGS_PORT || 8790);
const dataDir = process.env.HAPPENINGS_DATA_DIR || path.join(homedir(), '.dsh', 'happenings');
const dbPath = process.env.HAPPENINGS_DB || path.join(dataDir, 'happenings.db');

const db = openDatabase(
  dbPath,
  readFileSync(path.join(here, 'data', 'schema.sql'), 'utf8'),
  readFileSync(path.join(here, 'data', 'seed.sql'), 'utf8'),
);

const env = { DB: db };
if (process.env.HAPPENINGS_ADMIN_TOKEN) env.ADMIN_TOKEN = process.env.HAPPENINGS_ADMIN_TOKEN;
if (process.env.HAPPENINGS_COLLECTORS) env.COLLECTORS = process.env.HAPPENINGS_COLLECTORS;

const server = createServer(async (request, response) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    const upstream = await api.fetch(
      new Request(url, { method: request.method || 'GET', headers }),
      env,
    );
    const body = Buffer.from(await upstream.arrayBuffer());

    response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.on('error', (error) => {
  console.error(`[happenings] server error: ${error.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[happenings] api listening on http://127.0.0.1:${port} (database ${dbPath})`);
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
