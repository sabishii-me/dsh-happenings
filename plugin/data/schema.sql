-- Canonical event store. Dates are inclusive; `end_date` equals `start_date` for one-day events.
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  start_time    TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  mode          TEXT NOT NULL DEFAULT 'unknown',
  region        TEXT NOT NULL DEFAULT 'unknown',
  venue         TEXT,
  city          TEXT,
  cost_kind     TEXT,
  cost_amount   INTEGER,
  cost_currency TEXT,
  deadline      TEXT,
  url           TEXT,
  source_url    TEXT NOT NULL,
  source_name   TEXT,
  topics        TEXT NOT NULL DEFAULT '[]',
  ai_status     TEXT,
  ai_detail     TEXT,
  judgement     TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_range ON events (start_date, end_date);
CREATE INDEX IF NOT EXISTS events_updated ON events (updated_at);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,
  items       INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS ingest_runs_source ON ingest_runs (source, started_at);
