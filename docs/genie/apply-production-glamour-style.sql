-- BoothGen 2.114.0: Genie add-ons (Glamour Style, $15 per event until changed in Super Admin → Genie Usage).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds two columns with empty defaults,
-- then marks Glamour Style as included (free) on every event that already uses the old free "Beautify (Glamour)"
-- filter, so those events aren't charged or watermarked for it (G, 2026-11-19). Nothing is dropped. Safe to run more
-- than once.
BEGIN;

ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "addOnsIncluded" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "genie_event_payments" ADD COLUMN IF NOT EXISTS "addOns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "event_genie_settings"
SET "addOnsIncluded" = array_append("addOnsIncluded", 'glamourStyle')
WHERE ("filters"::text LIKE '%"beautify"%' OR "processing"::text LIKE '%"beautify"%')
  AND NOT ('glamourStyle' = ANY("addOnsIncluded"));

COMMIT;

-- Check: 2 columns, then how many events keep Glamour Style free
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'event_genie_settings' AND column_name = 'addOnsIncluded')
   OR (table_name = 'genie_event_payments' AND column_name = 'addOns')
UNION ALL
SELECT 'events keeping Glamour Style free: ' || count(*) FROM "event_genie_settings" WHERE 'glamourStyle' = ANY("addOnsIncluded");
