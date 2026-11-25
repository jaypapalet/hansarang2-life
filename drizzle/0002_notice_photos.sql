ALTER TABLE apartment_notices ADD COLUMN photo_key TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX apartment_notices_photo_key ON apartment_notices(photo_key);
--> statement-breakpoint
CREATE TABLE notice_photo_cleanup (
  photo_key TEXT PRIMARY KEY,
  generation TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  retain INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX notice_photo_cleanup_ready ON notice_photo_cleanup(ready_at);
