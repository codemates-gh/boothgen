-- BoothGen 2.85.0: thank-you screen (account default in Genie → Event Defaults → Capture, per-event override).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds columns only; safe to run twice.
-- Existing accounts and events get Genie's current screen (5 s, "Thank you!", "Your photos are on their way."),
-- which is left out of bundles, so nothing changes on iPads until someone edits it.
BEGIN;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "thankYouSeconds" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "thankYouTitle" TEXT NOT NULL DEFAULT 'Thank you!';
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "thankYouSubtitle" TEXT NOT NULL DEFAULT 'Your photos are on their way.';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "thankYouSeconds" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "thankYouTitle" TEXT NOT NULL DEFAULT 'Thank you!';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "thankYouSubtitle" TEXT NOT NULL DEFAULT 'Your photos are on their way.';
COMMIT;

-- Check (should return 6):
-- SELECT count(*) FROM information_schema.columns WHERE column_name IN ('thankYouSeconds', 'thankYouTitle', 'thankYouSubtitle');
