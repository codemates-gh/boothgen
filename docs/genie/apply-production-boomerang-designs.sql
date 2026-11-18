-- BoothGen 2.105.0: Genie Boomerang shapes and designs (P10): Standard and My Boomerang designs.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one table only; nothing is
-- changed or dropped. Safe to run more than once. Events keep their Boomerang as it is (no design chosen).
BEGIN;
CREATE TABLE IF NOT EXISTS "genie_clip_designs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "background" JSONB,
    "overlay" JSONB,
    "thumbnail" JSONB,
    "slot" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'designer',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_clip_designs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "genie_clip_designs_tenantId_idx" ON "genie_clip_designs"("tenantId");
DO $$ BEGIN
  ALTER TABLE "genie_clip_designs" ADD CONSTRAINT "genie_clip_designs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;

-- Check: should return 0 (an empty table)
SELECT count(*) FROM "genie_clip_designs";
