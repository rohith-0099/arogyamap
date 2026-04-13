-- Migration: Add location intelligence columns to reports table
-- Run in Supabase Dashboard → SQL Editor after initial schema is applied

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS zone_name TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS resolution_method TEXT DEFAULT 'unassigned';

CREATE INDEX IF NOT EXISTS idx_reports_zone ON reports (zone_name) WHERE zone_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_district ON reports (district) WHERE district IS NOT NULL;

COMMENT ON COLUMN reports.zone_name IS 'Resolved service zone (from GPS polygon or fuzzy text match)';
COMMENT ON COLUMN reports.district IS 'Administrative district for supervisor scoping';
COMMENT ON COLUMN reports.resolution_method IS 'Location resolution path: gps | text_fuzzy | text_llm | unassigned';
