-- Genie-only accounts, stage 1 (BoothGen 2.86.0): what each operator account bought.
-- Run in Neon production BEFORE deploying. Safe to run twice.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'crm';

-- Check: every existing account is "crm" (expect one row: crm | <number of operators>)
SELECT product, count(*) FROM tenants GROUP BY product;
