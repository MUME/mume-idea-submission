-- Council idea-review assessments: one assessment per idea, its per-item
-- proposals/seconds, and an append-only event log. Derived totals/bands are never
-- stored; they are computed server-side from the agreed items (see src/lib/rubric.ts).

CREATE TABLE assessments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id        INTEGER NOT NULL UNIQUE,
  rubric_version INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',   -- open | published
  published_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- One current proposal per (assessment, item). A revision bumps on every re-propose
-- and clears the second, so a second can only ever apply to the revision it saw.
CREATE TABLE assessment_items (
  assessment_id  INTEGER NOT NULL,
  item_id        TEXT NOT NULL,          -- clarity | evidence | … | usefulness | feasibility | interest
  value          INTEGER NOT NULL,       -- criteria 1..5, checks 0|1
  reason         TEXT NOT NULL,
  proposer_id    TEXT NOT NULL,
  proposer_name  TEXT NOT NULL,
  seconder_id    TEXT,
  seconder_name  TEXT,
  revision       INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (assessment_id, item_id)
);

CREATE TABLE assessment_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id  INTEGER NOT NULL,
  item_id        TEXT,
  action         TEXT NOT NULL,          -- propose | second | publish | reopen
  actor_id       TEXT NOT NULL,
  actor_name     TEXT NOT NULL,
  detail         TEXT,
  at             INTEGER NOT NULL
);

CREATE INDEX idx_assessment_items_aid ON assessment_items(assessment_id);
CREATE INDEX idx_assessment_log_aid ON assessment_log(assessment_id, at);
