-- BoothGen 2.83.0: per-event photo live view settings (mirror the live view; show the design while guests pose).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds columns only; safe to run twice.
-- Existing events: mirrored (as the iPad already did) and no design while posing.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "mirrorLiveView" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "showDesignWhilePosing" BOOLEAN NOT NULL DEFAULT false;
COMMIT;

-- Check (should return 2):
-- SELECT count(*) FROM information_schema.columns WHERE table_name = 'event_genie_settings' AND column_name IN ('mirrorLiveView', 'showDesignWhilePosing');
