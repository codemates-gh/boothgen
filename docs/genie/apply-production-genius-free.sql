-- Stage 4 (BoothGen 2.94.0): Genius needs Genius Pro; Super Admin's "Keep Genius free" per account.
-- Run in Neon production BEFORE deploying. Safe to run twice. Nothing changes for any account until Super Admin turns
-- "Genius needs Pro" on (Operators tab).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "geniusFree" BOOLEAN NOT NULL DEFAULT false;

-- Check: expect one row: false | <number of operators>
SELECT "geniusFree", count(*) FROM tenants GROUP BY "geniusFree";
