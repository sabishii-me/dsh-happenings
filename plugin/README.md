# Happenings — DSH plugin

A sidebar entry called **Happenings**. The panel hosts the live event calendar from this repository: multi-day events render as range bars, clicking an event opens a new tab, and "N more" opens the day drawer.

The plugin does two things:

- serves the prebuilt site on the Host's origin under `/dsh-happenings/app/`;
- proxies a fixed set of API endpoints to the backend and owns the local backend lifecycle.

The calendar itself is the React / FullCalendar site in `src/web`; there is no second UI.

## Install

From a checkout:

```sh
dsh plugin --profile <profile> add link:/absolute/path/to/dsh-happenings/plugin
```

From the git repository (the package lives in the `plugin/` subdirectory):

```sh
dsh plugin --profile <profile> add github:sabishii-me/dsh-happenings#path:/plugin
```

Remove it with:

```sh
dsh plugin --profile <profile> remove dsh-happenings
```

## Architecture

```
DSH sidebar → Happenings panel → /dsh-happenings/app/   (same-origin static site)
                                → /dsh-happenings/api/*  (Host proxy to the backend)
```

- Static assets are snapshotted from `plugin/web` at registration time. No request path is used as a disk path, and symlinks are not followed.
- Only fixed endpoints are proxied: `health`, `events`, `meta`, `refresh`, `ics`, `export`.
- Refresh is the only `POST`; it is checked for same-origin. The proxy never forwards browser cookies, credentials or request bodies.
- The iframe isolates the site's CSS and React runtime.

## Backend lifecycle

On load the plugin probes `/api/health`:

| Situation | Behaviour |
|---|---|
| Already healthy | Reused; nothing is started or killed |
| No service | `wrangler dev --port 8790` is spawned detached, logging to `.runtime/happenings-worker.log`, waiting up to 90 s |
| Plugin unloaded | Only the processes it started are killed (on Windows `taskkill /t /f`) |

With `backendUrl` pointing at a deployed site, or `autoStart: false`, the plugin never touches local processes.

```yaml
backendUrl: http://127.0.0.1:8790
requestTimeoutMs: 120000
# port: 8790
# siteDir: /path/to/checkout
# autoStart: false
# adminToken: only for a deployment that requires it; used for refresh
```

`HAPPENINGS_BACKEND_URL`, `HAPPENINGS_PORT` and `HAPPENINGS_SITE_DIR` override the defaults. The site checkout is detected from `siteDir`, the plugin's parent directory, a `site/` subdirectory, or the current working directory. When none matches, the panel reports what to configure.

## Development

From the repository root:

```sh
npm run build:plugin     # rebuild plugin/web from src/web
npm run test:plugin      # host routes, client registration, lifecycle
npm run preview          # run the backend by hand (the plugin also starts it)
```

`plugin/web` is generated output. Run `npm run build:plugin` after changing `src/web`, and commit the result so an install from git ships the current UI.

## Tests

`npm run test:plugin` covers route registration, proxy and security behaviour, and the reuse/start/stop lifecycle. The site has its own unit and Playwright suites (`npm test`, `npm run e2e`).
