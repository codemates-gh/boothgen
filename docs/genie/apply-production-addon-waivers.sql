-- BoothGen 2.117.0: Super Admin fee waivers for paid Genie add-ons (e.g. Glamour Style for partner operators).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one column, empty for every account
-- (nobody is waived until Super Admin ticks it). Nothing is changed or dropped. Safe to run more than once.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "addOnWaivers" JSONB NOT NULL DEFAULT '{}';

-- Check: should return 1 row
SELECT table_name || '.' || column_name AS item FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'addOnWaivers';
