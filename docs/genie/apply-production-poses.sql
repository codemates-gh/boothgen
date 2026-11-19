-- BoothGen 2.109.0: Genie pose library (P11): Standard and My poses, "Pose ideas" in Event defaults and per event.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one table and new columns with
-- defaults (pose ideas off everywhere); nothing is changed or dropped. Safe to run more than once.
-- After the deploy: Super Admin → Poses → "Import starter poses" adds the 48 Standard poses.
BEGIN;

ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "customPoses" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "poseIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "posesEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "poseIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "posesEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "genie_poses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "soloStyle" TEXT,
    "people" INTEGER,
    "image" JSONB NOT NULL,
    "thumbnail" JSONB,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_poses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "genie_poses_tenantId_idx" ON "genie_poses"("tenantId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'genie_poses_tenantId_fkey') THEN
    ALTER TABLE "genie_poses" ADD CONSTRAINT "genie_poses_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Check: should return 6 rows (the table and five columns)
SELECT 'genie_poses table' AS item FROM information_schema.tables WHERE table_name = 'genie_poses'
UNION ALL
SELECT table_name || '.' || column_name FROM information_schema.columns
WHERE (table_name = 'event_genie_settings' AND column_name IN ('customPoses', 'poseIds', 'posesEnabled'))
   OR (table_name = 'genie_defaults' AND column_name IN ('poseIds', 'posesEnabled'));
