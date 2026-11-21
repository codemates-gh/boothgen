-- BoothGen 2.133.0: Geniefied "Show 'Get Geniefied' title" per event (on for every event, as today).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one column (true everywhere);
-- nothing is changed or dropped. Safe to run more than once.
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiShowTitle" BOOLEAN NOT NULL DEFAULT true;

-- Check: should return 1 row
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE table_name = 'event_genie_settings' AND column_name = 'aiShowTitle';
