-- Engagement stats per story (PRD D5): enables future engagement-weighted
-- scoring without losing history. Nullable defensively for edge-case items.
ALTER TABLE stories ADD COLUMN points INTEGER;
ALTER TABLE stories ADD COLUMN num_comments INTEGER;

-- Both secondary indexes are redundant (write-budget guardrail, PRD §4.4):
-- stories(recorded_at) is the leftmost prefix of the (recorded_at, rank) PK;
-- readings.recorded_at is the rowid PK, already ordered.
DROP INDEX IF EXISTS idx_stories_recorded_at;
DROP INDEX IF EXISTS idx_readings_recorded_at;
