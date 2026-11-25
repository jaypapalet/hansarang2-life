CREATE TABLE neighborhood_event_snapshots (
  source_key TEXT PRIMARY KEY NOT NULL,
  entries TEXT NOT NULL DEFAULT '[]',
  checked_at INTEGER,
  updated_at INTEGER,
  failed INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
