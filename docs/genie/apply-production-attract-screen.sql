-- BoothGen 2.77.0: attract screen (account default in Genie → Event Defaults, per-event override on Event → Genie).
-- Run in the Neon SQL Editor on the PRODUCTION branch. Adds columns only; nothing is dropped. Safe to run more than once.
-- Existing events follow the attract default (customAttract false): they had no attract screen to customize.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "attract" JSONB;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "attractReturnAfterSeconds" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "attract" JSONB;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "attractReturnAfterSeconds" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "customAttract" BOOLEAN NOT NULL DEFAULT false;
COMMIT;

-- Check (should return five rows):
-- SELECT table_name, column_name, data_type, column_default FROM information_schema.columns
--   WHERE column_name IN ('attract', 'attractReturnAfterSeconds', 'customAttract') ORDER BY 1, 2;
