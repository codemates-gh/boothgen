-- BoothGen 2.107.0: keep the original of a repositioned template background (Template designer → Reposition).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one nullable column; nothing is
-- changed or dropped. Safe to run more than once.
ALTER TABLE "booth_design_templates" ADD COLUMN IF NOT EXISTS "backgroundSources" JSONB;

-- Check: should return one row (backgroundSources, jsonb)
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'booth_design_templates' AND column_name = 'backgroundSources';
