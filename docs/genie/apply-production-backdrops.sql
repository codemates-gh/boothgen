-- BoothGen 2.82.0: Genie virtual backdrop (background removal): Standard backdrops in Super Admin, My backdrops,
-- per-event selection. Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds a table
-- and columns only; nothing is dropped. Safe to run more than once. The backdrop is off on every existing event.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "backdropsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "backdropIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "backdropDefaultId" TEXT;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "backdropGuestPicks" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "backdropEdgeSoftness" TEXT NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS "genie_backdrops" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "image" JSONB NOT NULL,
    "thumbnail" JSONB,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_backdrops_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "genie_backdrops_tenantId_idx" ON "genie_backdrops"("tenantId");
DO $$ BEGIN
  ALTER TABLE "genie_backdrops" ADD CONSTRAINT "genie_backdrops_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;

-- Check (should return 5, then 1):
-- SELECT count(*) FROM information_schema.columns WHERE table_name = 'event_genie_settings' AND column_name LIKE 'backdrop%';
-- SELECT count(*) FROM information_schema.tables WHERE table_name = 'genie_backdrops';
-- After deploying: Super Admin → Backdrops → Import starter backdrops (8 backdrops).
