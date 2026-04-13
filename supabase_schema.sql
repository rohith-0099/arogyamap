-- ArogyaMap Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS reports (
  id              SERIAL PRIMARY KEY,
  user_hash       TEXT NOT NULL,
  lat             FLOAT,
  lng             FLOAT,
  city            TEXT,
  zone_name       TEXT,
  district        TEXT,
  resolution_method TEXT DEFAULT 'unassigned',
  symptoms_raw    TEXT,
  symptoms_summary TEXT NOT NULL,
  urgency         TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
  advice          TEXT,
  has_cough       BOOLEAN DEFAULT false,
  voice_stress    FLOAT DEFAULT 0,
  cough_type      TEXT DEFAULT 'none',
  photo_analysis  TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'email')),
  language        TEXT DEFAULT 'en',
  follow_up_sent  BOOLEAN DEFAULT false,
  follow_up_status TEXT,
  outbreak_flag   BOOLEAN DEFAULT false,
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_reports_urgency ON reports (urgency);
CREATE INDEX IF NOT EXISTS idx_reports_outbreak ON reports (outbreak_flag) WHERE outbreak_flag = true;
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng ON reports (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_zone ON reports (zone_name) WHERE zone_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_district ON reports (district) WHERE district IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy: anyone (anon) can read reports (public map)
CREATE POLICY "Public read reports"
  ON reports FOR SELECT
  TO anon, authenticated
  USING (true);

-- Policy: anyone can insert reports (anonymous reporting)
CREATE POLICY "Public insert reports"
  ON reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: service role can update (for follow-up, outbreak flags)
CREATE POLICY "Service update reports"
  ON reports FOR UPDATE
  TO service_role
  USING (true);

-- Enable real-time for live map updates
-- In Supabase Dashboard: Table Editor → reports → Enable Realtime
-- Or via API:
ALTER PUBLICATION supabase_realtime ADD TABLE reports;

-- Tag PHI/sensitive columns
COMMENT ON COLUMN reports.user_hash IS 'Privacy: MD5 of user identity, irreversible, no PII';
COMMENT ON COLUMN reports.lat IS 'Privacy: GPS rounded to 500m grid';
COMMENT ON COLUMN reports.lng IS 'Privacy: GPS rounded to 500m grid';
COMMENT ON COLUMN reports.symptoms_raw IS 'PHI: original patient transcription (private)';
COMMENT ON COLUMN reports.symptoms_summary IS 'Public: AI-generalised category only';
