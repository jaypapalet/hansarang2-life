ALTER TABLE apartment_notices ADD COLUMN source_key TEXT;
--> statement-breakpoint
ALTER TABLE apartment_notices ADD COLUMN source_url TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX kapt_notice_source_key ON apartment_notices (source_key) WHERE source_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE kapt_notice_publications (
  source_key TEXT PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE kapt_notice_sync (
  source TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  token TEXT NOT NULL,
  retry_at INTEGER NOT NULL,
  state TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);
