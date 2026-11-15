-- Genie-only accounts, stage 3 (BoothGen 2.91.0): email confirmation at sign-up.
-- Run in Neon production BEFORE deploying. Safe to run twice.
ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

-- Everyone who already has an account counts as confirmed, so nobody gets locked out
UPDATE users SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- Check: expect 0
SELECT count(*) FROM users WHERE "emailVerifiedAt" IS NULL;
