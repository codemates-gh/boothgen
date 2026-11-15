-- Genie-only accounts, stage 2c (BoothGen 2.90.0): guest texts and emails through BoothGen's own Twilio and Resend.
-- Run in Neon production BEFORE deploying. Safe to run twice.
ALTER TABLE genie_messaging_configs ADD COLUMN IF NOT EXISTS "smsSource" TEXT;
ALTER TABLE genie_messaging_configs ADD COLUMN IF NOT EXISTS "emailSource" TEXT;
ALTER TABLE genie_shares ADD COLUMN IF NOT EXISTS "provider" TEXT;

-- Check: expect 3 rows
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'genie_messaging_configs' AND column_name IN ('smsSource', 'emailSource'))
   OR (table_name = 'genie_shares' AND column_name = 'provider');
