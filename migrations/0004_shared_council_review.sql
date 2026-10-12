-- Shared drafts replace per-item seconding. Existing v1 assessments/logs remain.
CREATE TABLE council_reviews (
  idea_id INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  rubric_version INTEGER NOT NULL DEFAULT 1,
  idea_content TEXT NOT NULL,
  draft TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | publishing | published
  record_message_id TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE council_review_agreements (
  idea_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (idea_id, revision, actor_id)
);
CREATE TABLE council_review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX council_review_events_idea ON council_review_events(idea_id, id);
