CREATE TABLE audit_events_v2 (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'anonymous', 'system', 'public')),
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

INSERT INTO audit_events_v2 (
  id, event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
  outcome, request_id, ip_hash, user_agent_hash, metadata_json
)
SELECT
  id, event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
  outcome, request_id, ip_hash, user_agent_hash, metadata_json
FROM audit_events;

DROP TABLE audit_events;

ALTER TABLE audit_events_v2 RENAME TO audit_events;

CREATE INDEX idx_audit_events_occurred_at ON audit_events (occurred_at);
CREATE INDEX idx_audit_events_request_id ON audit_events (request_id);
