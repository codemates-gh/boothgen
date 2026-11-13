-- BoothGen 2.75.0: Genie "look at the camera" prompt and Boomerang settings per event.
-- Run in the Neon SQL Editor on the PRODUCTION branch. Adds two optional columns; nothing is dropped or changed.
-- Safe to run more than once.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "lookAtCamera" JSONB;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "boomerang" JSONB;
COMMIT;

-- Check (should return two rows: boomerang, lookAtCamera):
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_genie_settings' AND column_name IN ('lookAtCamera', 'boomerang') ORDER BY 1;
