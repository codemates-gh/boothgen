-- BoothGen 2.71.0: "Turn on for every event automatically" for the client design brief.
-- Run in the Neon SQL Editor on the PRODUCTION branch. Adds one column; nothing is dropped.
BEGIN;
ALTER TABLE "tenant_branding" ADD COLUMN IF NOT EXISTS "designBriefAutoActivate" BOOLEAN NOT NULL DEFAULT false;
COMMIT;

-- Check (should return one row):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_branding' AND column_name = 'designBriefAutoActivate';
