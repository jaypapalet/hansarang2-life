CREATE TABLE notice_users (
  username TEXT PRIMARY KEY CHECK (
    length(username) BETWEEN 3 AND 32
    AND username NOT GLOB '*[^a-z0-9_-]*'
    AND substr(username, 1, 1) GLOB '[a-z0-9]'
  ),
  password_hash TEXT NOT NULL CHECK (length(password_hash) = 64 AND password_hash NOT GLOB '*[^a-f0-9]*'),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version >= 1),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX notice_single_owner ON notice_users(role) WHERE role = 'owner';
--> statement-breakpoint
CREATE TABLE notice_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^a-f0-9]*'),
  username TEXT NOT NULL REFERENCES notice_users(username) ON DELETE CASCADE,
  session_version INTEGER NOT NULL CHECK (session_version >= 1),
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX notice_sessions_expiry ON notice_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX notice_sessions_user ON notice_sessions(username);
