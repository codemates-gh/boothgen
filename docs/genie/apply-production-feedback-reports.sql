-- BoothGen 2.73.0 / 2.74.0: bug reports and suggestions (Report a bug / Suggest, shared Reports board, Super Admin → Reports).
-- Run in the Neon SQL Editor on the PRODUCTION branch. Creates three new tables and, if an earlier version of this
-- file was already run, adds the newer columns. Nothing existing is changed or dropped. Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS "feedback_reports" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "severity" TEXT,
    "deviceInfo" TEXT,
    "details" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT,
    "fixedInVersion" TEXT,
    "howToFind" TEXT,
    "howToFindUrl" TEXT,
    "duplicateOfId" TEXT,
    "assignedToDev" BOOLEAN NOT NULL DEFAULT false,
    "assignedAt" TIMESTAMP(3),
    "adminUnread" BOOLEAN NOT NULL DEFAULT true,
    "reporterUnread" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feedback_notes" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_notes_pkey" PRIMARY KEY ("id")
);

-- Added after the first version of this file (for databases that already have feedback_reports)
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "howToFind" TEXT;
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "howToFindUrl" TEXT;
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "duplicateOfId" TEXT;
-- 2.74.0: Assign to Dev
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "assignedToDev" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feedback_reports" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
-- 2.74.0: screenshots on replies and notes
ALTER TABLE "feedback_notes" ADD COLUMN IF NOT EXISTS "attachments" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "feedback_followers" (
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voted" BOOLEAN NOT NULL DEFAULT true,
    "following" BOOLEAN NOT NULL DEFAULT true,
    "unread" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_followers_pkey" PRIMARY KEY ("reportId","userId")
);

ALTER TABLE "feedback_followers" ADD COLUMN IF NOT EXISTS "voted" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "feedback_followers" ADD COLUMN IF NOT EXISTS "following" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "feedback_followers_userId_idx" ON "feedback_followers"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_reports_number_key" ON "feedback_reports"("number");
CREATE INDEX IF NOT EXISTS "feedback_reports_status_idx" ON "feedback_reports"("status");
CREATE INDEX IF NOT EXISTS "feedback_reports_userId_idx" ON "feedback_reports"("userId");
CREATE INDEX IF NOT EXISTS "feedback_reports_assignedToDev_idx" ON "feedback_reports"("assignedToDev");
CREATE INDEX IF NOT EXISTS "feedback_notes_reportId_idx" ON "feedback_notes"("reportId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_userId_fkey') THEN
    ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_tenantId_fkey') THEN
    ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_notes_reportId_fkey') THEN
    ALTER TABLE "feedback_notes" ADD CONSTRAINT "feedback_notes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_notes_authorId_fkey') THEN
    ALTER TABLE "feedback_notes" ADD CONSTRAINT "feedback_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_duplicateOfId_fkey') THEN
    ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "feedback_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_followers_reportId_fkey') THEN
    ALTER TABLE "feedback_followers" ADD CONSTRAINT "feedback_followers_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "feedback_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_followers_userId_fkey') THEN
    ALTER TABLE "feedback_followers" ADD CONSTRAINT "feedback_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- Check (should return 3 rows, then 1 row):
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('feedback_reports', 'feedback_notes', 'feedback_followers');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'feedback_reports' AND column_name = 'howToFind';
