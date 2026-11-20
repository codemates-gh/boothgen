-- BoothGen 2.130.0: Video Booth (Genie P14). Guests record a short video message to a prompt; the event's settings
-- (EventBundle.videoBooth), the account's defaults, and the prompt and a "hidden" mark on each uploaded video.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds columns only (all empty / off);
-- nothing is changed or dropped. Safe to run more than once.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "videoBooth" JSONB;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "videoBooth" JSONB;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "customVideoBooth" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "promptId" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "promptText" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
COMMIT;

-- Check: should return 6 rows
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'genie_defaults' AND column_name = 'videoBooth')
   OR (table_name = 'event_genie_settings' AND column_name IN ('videoBooth', 'customVideoBooth'))
   OR (table_name = 'gallery_assets' AND column_name IN ('promptId', 'promptText', 'hiddenAt'));
