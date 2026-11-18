-- BoothGen 2.108.0: product roadmap in Report a bug / Suggest (Super Admin → Reports → Roadmap).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one table and one empty column
-- on feedback_reports (the roadmap item a suggestion is linked to); nothing is changed or dropped. Safe to run more
-- than once. The starting list of items is a separate file: docs/genie/roadmap-seed.sql (run it after this one).
BEGIN;

CREATE TABLE IF NOT EXISTS "roadmap_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "area" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'later',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "planRef" TEXT,
    "shippedAt" DATE,
    "shippedVersion" TEXT,
    "visibleToOperators" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "roadmap_items_status_idx" ON "roadmap_items"("status");

ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "roadmapItemId" TEXT;
CREATE INDEX IF NOT EXISTS "feedback_reports_roadmapItemId_idx" ON "feedback_reports"("roadmapItemId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_roadmapItemId_fkey') THEN
    ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_roadmapItemId_fkey"
      FOREIGN KEY ("roadmapItemId") REFERENCES "roadmap_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Check: should return two rows (roadmap_items table, roadmapItemId column)
SELECT 'roadmap_items table' AS item FROM information_schema.tables WHERE table_name = 'roadmap_items'
UNION ALL
SELECT 'roadmapItemId column' FROM information_schema.columns WHERE table_name = 'feedback_reports' AND column_name = 'roadmapItemId';
