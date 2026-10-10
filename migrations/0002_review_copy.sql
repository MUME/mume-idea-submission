-- Track the mirrored copy of an idea in the private review forum (submitted-ideas).
-- Both nullable; only set once an idea reaches Submitted.

ALTER TABLE ideas ADD COLUMN review_thread_id TEXT;
ALTER TABLE ideas ADD COLUMN review_message_id TEXT;
