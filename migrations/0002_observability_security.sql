CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'anonymous', 'system')),
  actor_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  request_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_audit_events_occurred_at ON audit_events (occurred_at);
CREATE INDEX idx_audit_events_request_id ON audit_events (request_id);

CREATE TABLE auth_attempts (
  subject_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  blocked_until TEXT
);

CREATE TABLE csrf_tokens (
  token_hash TEXT PRIMARY KEY,
  session_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
