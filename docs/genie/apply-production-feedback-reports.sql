-- BoothGen 2.72.0: bug reports and suggestions (Report a bug / Suggest, My reports, Super Admin → Reports).
-- Run in the Neon SQL Editor on the PRODUCTION branch. Creates two new tables; nothing existing is changed or
-- dropped. Safe to run more than once.
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feedback_reports_number_key" ON "feedback_reports"("number");
CREATE INDEX IF NOT EXISTS "feedback_reports_status_idx" ON "feedback_reports"("status");
CREATE INDEX IF NOT EXISTS "feedback_reports_userId_idx" ON "feedback_reports"("userId");
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
END $$;

COMMIT;

-- Check (should return 2 rows):
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('feedback_reports', 'feedback_notes');
