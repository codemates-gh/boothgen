-- BoothGen 2.134.0: Genie → Genie 360 page (Genie P15). The account's own 360 styles ("My styles") and its Genie 360
-- setup for new 360 events. Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds two
-- empty columns and an index; nothing is changed or dropped. Safe to run more than once.
BEGIN;
ALTER TABLE "genie_spin_styles" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
DO $$ BEGIN
  ALTER TABLE "genie_spin_styles" ADD CONSTRAINT "genie_spin_styles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "genie_spin_styles_tenantId_idx" ON "genie_spin_styles"("tenantId");
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "spin360" JSONB;
COMMIT;

-- Check: should return 2 rows
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'genie_spin_styles' AND column_name = 'tenantId') OR (table_name = 'genie_defaults' AND column_name = 'spin360');
