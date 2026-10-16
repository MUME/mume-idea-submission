-- Checks are seconded as one selection; scores use an independent three-person vote.
-- Keep old whole-assessment agreement rows/history rather than treating them as
-- score-only agreements automatically.
ALTER TABLE council_reviews ADD COLUMN score_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE council_reviews ADD COLUMN checks_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE council_reviews ADD COLUMN checks_proposer_id TEXT;
ALTER TABLE council_reviews ADD COLUMN checks_proposer_name TEXT;
ALTER TABLE council_reviews ADD COLUMN checks_seconder_id TEXT;
ALTER TABLE council_reviews ADD COLUMN checks_seconder_name TEXT;
CREATE TABLE council_score_agreements (
  idea_id INTEGER NOT NULL,
  score_revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (idea_id, score_revision, actor_id)
);
