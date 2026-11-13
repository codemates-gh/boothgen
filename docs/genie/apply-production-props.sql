-- BoothGen 2.81.0: Genie virtual props (Standard library in Super Admin, My props, per-event selection).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds tables and columns only;
-- nothing is dropped. Safe to run more than once. Props are off on every existing event.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "propsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "propIds" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "genie_props" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "alsoIn" JSONB NOT NULL DEFAULT '[]',
    "image" JSONB NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "anchor" TEXT NOT NULL,
    "anchorX" DOUBLE PRECISION NOT NULL,
    "anchorY" DOUBLE PRECISION NOT NULL,
    "eyeDistance" DOUBLE PRECISION NOT NULL DEFAULT 300,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_props_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "genie_props_tenantId_idx" ON "genie_props"("tenantId");
DO $$ BEGIN
  ALTER TABLE "genie_props" ADD CONSTRAINT "genie_props_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "genie_prop_categories" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "genie_prop_categories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "genie_prop_categories_parentId_idx" ON "genie_prop_categories"("parentId");
COMMIT;

-- Check (should return 2, then 2):
-- SELECT count(*) FROM information_schema.columns WHERE table_name = 'event_genie_settings' AND column_name IN ('propsEnabled', 'propIds');
-- SELECT count(*) FROM information_schema.tables WHERE table_name IN ('genie_props', 'genie_prop_categories');
-- After deploying: Super Admin → Props → Import starter props (189 props, 6 categories).
