-- BoothGen 2.120.0: "Show the Genie logo on the start screen" (CaptureConfig.startScreen.showGenieLogo), on by default.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one column to Event defaults and one
-- to events, on for all (the logo shows as today). Nothing is changed or dropped. Safe to run more than once.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "startScreenGenieLogo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "startScreenGenieLogo" BOOLEAN NOT NULL DEFAULT true;
COMMIT;

-- Check: should return 2 rows
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE column_name = 'startScreenGenieLogo' AND table_name IN ('genie_defaults', 'event_genie_settings');
