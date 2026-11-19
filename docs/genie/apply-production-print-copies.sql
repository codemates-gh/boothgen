-- BoothGen 2.118.0: Genie "Copies match the number of people" (PrintingConfig.copiesMatchPeople), on by default.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one column to account defaults and
-- one to events, on for all of them (G, 2026-11-19). Nothing is changed or dropped. Safe to run more than once.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "printCopiesMatchPeople" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "printCopiesMatchPeople" BOOLEAN NOT NULL DEFAULT true;
COMMIT;

-- Check: should return 2 rows
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE column_name = 'printCopiesMatchPeople' AND table_name IN ('genie_defaults', 'event_genie_settings');
