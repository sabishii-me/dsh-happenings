# happenings

A live calendar for AI-game and vibe-coding events. Collectors pull public listings into Cloudflare D1 on a schedule, and a React / FullCalendar front end renders them — multi-day events appear as range bars, not one chip per day.

The same site is packaged as a DSH plugin in [`plugin/`](plugin/README.md). The plugin ships its own Node/SQLite backend, so it runs without Wrangler, Workerd or a Cloudflare account; the Cloudflare Worker is only for the standalone deployment.

## Features

- Month and week views, with a day drawer for the "N more" entries.
- Multi-day events rendered as continuous bars.
- Topic filters and an AI-policy filter.
- Chinese, English and Japanese UI.
- ICS feed, JSON export and a small JSON API.
- Scheduled refresh every 30 minutes; a manual refresh button in the header.
- A DSH plugin with a bundled Node/SQLite backend, independent of Cloudflare.

## Requirements

- Node.js **22.5 or newer** (unit tests use `node:sqlite`).
- npm.

## Run locally

```bash
npm install
npm run db:local   # create the local D1 database and load the seed
npm run dev        # build the SPA, then start wrangler dev
```

Open <http://127.0.0.1:8790>.

For UI-only work, keep the backend running and use:

```bash
npm run dev:web    # Vite on :5173, proxies /api to :8790
```

## Tests

```bash
npm run typecheck
npm test              # unit tests
npm run test:plugin   # DSH plugin host/route/lifecycle tests
npm run build         # production SPA build
```

End-to-end tests need a built site and a local database:

```bash
npm run db:local
npm run build
npx playwright install chromium
npm run e2e
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service health. |
| GET | `/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&topics=meetup,game-jam&ai=allowed` | Events overlapping the range. |
| GET | `/api/events/:id` | One event. |
| GET | `/api/meta` | Totals and the last run per source. |
| GET | `/api/ics` | Subscribable calendar (all-day `DTEND` is `end + 1 day`). |
| GET | `/api/export` | Full event dump. |
| POST | `/api/refresh[?collectors=connpass]` | Run collectors now. |

`/api/events` always returns the same envelope:

```json
{ "schemaVersion": "1.0.0", "generatedAt": "…", "query": {}, "items": [], "diagnostics": [], "stats": {} }
```

When `ADMIN_TOKEN` is configured, `POST /api/refresh` requires the `x-admin-token` header. Without it, refresh is open — set the secret for any public deployment.

## Collectors

| Source | Strategy |
|---|---|
| community.chain.tokyo | Reads `article.event-card` cards; the "詳細を見る" link is the event page. |
| connpass | Searches `.event_list.vevent` cards; converts the UTC `dtstart` to JST. |
| itch.io | Reads `.jam` cards and each jam page for the submission window. |

A failing source records an error in `ingest_runs` and leaves existing rows untouched. Duplicate events from different sources are folded by title fingerprint and date proximity.

## Schedule

`wrangler.jsonc` declares `*/30 * * * *`. Local development does not fire cron triggers; invoke the handler manually:

```bash
curl "http://127.0.0.1:8790/cdn-cgi/local/scheduled"
```

## Deploy

```bash
npx wrangler login
npx wrangler d1 create happenings
# put the returned database_id into wrangler.jsonc
npm run db:remote
npx wrangler secret put ADMIN_TOKEN   # optional, but recommended
npm run deploy
```

AI judgement is optional. Add `"ai": { "binding": "AI" }` to `wrangler.jsonc` to enable Workers AI; local development then needs `CLOUDFLARE_API_TOKEN` because the binding is a remote resource.

The npm scripts set `TMP`, `TEMP` and `XDG_*` inside the repository so workerd can write its cache on Windows. The variables are harmless on Linux and macOS.

## Layout

```
wrangler.jsonc   D1, Assets, Cron and nodejs_compat
migrations/      schema and seed data
src/domain/      date parsing, normalization, calendar mapping, ICS
src/worker/      Hono routes, D1 store, collectors, dedupe, AI judge
src/web/         React SPA: calendar, drawer, filters, i18n
plugin/          DSH plugin: static site, bundled Node/SQLite API, lifecycle
scripts/         build helpers for the plugin API bundle
test/unit/       unit tests and HTML fixtures
test/e2e/        Playwright
```

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run test:plugin
```

## License

[MIT](LICENSE)
