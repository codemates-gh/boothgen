-- BoothGen 2.76.0: "Edge light while a boomerang records" (Capture section: account default + per-event override).
-- Run in the Neon SQL Editor on the PRODUCTION branch. Adds one column to each table, on by default; nothing is dropped.
-- Safe to run more than once.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "boomerangEdgeLight" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "boomerangEdgeLight" BOOLEAN NOT NULL DEFAULT true;
COMMIT;

-- Check (should return two rows):
-- SELECT table_name, column_name, column_default FROM information_schema.columns WHERE column_name = 'boomerangEdgeLight' ORDER BY 1;
