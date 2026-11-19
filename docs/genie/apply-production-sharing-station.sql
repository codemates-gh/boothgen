-- BoothGen 2.112.0: Genie P12 Sharing station for PC booth software (Release A).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds columns with defaults (the add-on
-- is off on every event; nothing is charged until an operator turns it on and pays) and one unique index on columns
-- that are empty for every existing photo. Nothing is changed or dropped. Safe to run more than once.
BEGIN;

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "sharingStationOff" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "boothId" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "boothName" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "sourceFileName" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "sourceSha256" TEXT;

ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "sharingBlurGrid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "sharingRecentMinutes" INTEGER;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "sharingStationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "sharingStationPcs" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "sharingUploadAll" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "genie_event_payments" ADD COLUMN IF NOT EXISTS "sharingPcs" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "gallery_assets_galleryId_sourceSha256_genieKind_key" ON "gallery_assets"("galleryId", "sourceSha256", "genieKind");

COMMIT;

-- Check: should return 13 rows (12 columns and the index)
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'tenants' AND column_name = 'sharingStationOff')
   OR (table_name = 'gallery_assets' AND column_name IN ('boothId', 'boothName', 'source', 'sourceFileName', 'sourceSha256'))
   OR (table_name = 'event_genie_settings' AND column_name IN ('sharingBlurGrid', 'sharingRecentMinutes', 'sharingStationEnabled', 'sharingStationPcs', 'sharingUploadAll'))
   OR (table_name = 'genie_event_payments' AND column_name = 'sharingPcs')
UNION ALL
SELECT 'index ' || indexname FROM pg_indexes WHERE indexname = 'gallery_assets_galleryId_sourceSha256_genieKind_key';
