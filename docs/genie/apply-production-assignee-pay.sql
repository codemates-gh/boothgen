-- BoothGen 2.111.0: Pay for the person assigned to an event (the Pay field next to Assigned To).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one empty column to the event
-- expenses table; nothing is changed or dropped. Safe to run more than once.
ALTER TABLE "event_expenses" ADD COLUMN IF NOT EXISTS "assigneeUserId" TEXT;

-- Check: should return one row (assigneeUserId)
SELECT column_name FROM information_schema.columns WHERE table_name = 'event_expenses' AND column_name = 'assigneeUserId';
