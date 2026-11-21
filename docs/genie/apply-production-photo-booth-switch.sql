-- BoothGen 2.135.0: the event page's Photo booth switch (feature switches at the top of Event → Genie).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one column (on for every event),
-- then turns it off for events that run Video Booth as "video only" today (the same thing). Nothing is dropped.
-- Safe to run more than once.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "photosEnabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "event_genie_settings" SET "photosEnabled" = false
WHERE "videoBooth"->>'offer' = 'videoOnly' AND ("videoBooth"->>'enabled')::boolean IS TRUE;
COMMIT;

-- Check: should return 1 row
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE table_name = 'event_genie_settings' AND column_name = 'photosEnabled';
