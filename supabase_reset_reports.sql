-- ═════════════════════════════════════════════════════════════════════════
-- ArogyaMap — Clean slate for testing
-- Run in Supabase Dashboard → SQL Editor
-- Wipes all report data and resets the id sequence. Keeps the schema + RLS.
-- ═════════════════════════════════════════════════════════════════════════

-- 1. Remove every report row
TRUNCATE TABLE reports RESTART IDENTITY CASCADE;

-- 2. Verify — should return 0
SELECT COUNT(*) AS remaining_reports FROM reports;

-- (Optional) also clear profiles so you can re-test signup as a fresh user.
-- Uncomment the next two lines if you want a full auth reset.
-- DELETE FROM profiles;
-- DELETE FROM auth.users;   -- requires service role in SQL editor
