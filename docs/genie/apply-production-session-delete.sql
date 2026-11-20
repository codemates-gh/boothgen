-- BoothGen 2.122.0: Genie guest sessions can be deleted (the guest cancels on the iPad's review screen).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one empty column; nothing is
-- changed or dropped. Safe to run more than once.
ALTER TABLE "genie_sessions" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Check: should return 1 row
SELECT table_name || '.' || column_name AS item FROM information_schema.columns WHERE table_name = 'genie_sessions' AND column_name = 'deletedAt';
