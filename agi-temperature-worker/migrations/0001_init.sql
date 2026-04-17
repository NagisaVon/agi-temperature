-- Initial schema for agi-temperature.
-- Stores every fetched HN title with its rank and AI-related decision,
-- plus the aggregate reading for each 5-minute bucket.

CREATE TABLE IF NOT EXISTS readings (
  recorded_at   INTEGER NOT NULL PRIMARY KEY,   -- unix seconds, bucketed to 5-min
  score         REAL    NOT NULL,
  temperature_c REAL    NOT NULL,
  classifier_version TEXT NOT NULL,
  scoring_version    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  recorded_at INTEGER NOT NULL,                 -- FK to readings.recorded_at
  rank        INTEGER NOT NULL,                 -- 1..100
  hn_id       INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  is_ai       INTEGER NOT NULL,                 -- 0/1
  PRIMARY KEY (recorded_at, rank)
);

CREATE INDEX IF NOT EXISTS idx_stories_recorded_at ON stories(recorded_at);
CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON readings(recorded_at DESC);
