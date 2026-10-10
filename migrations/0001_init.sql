-- MUME Idea Submission — initial schema (build spec §4)

CREATE TABLE ideas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  thread_id       TEXT,
  message_id      TEXT,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_proposal',
  schema_version  INTEGER NOT NULL,
  answers         TEXT NOT NULL,        -- JSON, keyed by field id
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_ideas_thread ON ideas(thread_id);
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_ideas_author ON ideas(author_id);

CREATE TABLE status_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id     INTEGER NOT NULL REFERENCES ideas(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_log_idea ON status_log(idea_id);
