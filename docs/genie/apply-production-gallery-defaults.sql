-- BoothGen 2.119.0: Gallery defaults for Genie events (G, 2026-11-19): "Upload every photo to the gallery" and "Publish
-- the gallery when the event ends", on for Genius accounts, off for Genie-only, for NEW events only.
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Safe to run more than once.
BEGIN;

ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "sharingUploadAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "genie_defaults" ADD COLUMN IF NOT EXISTS "galleryAutoPublish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "galleryAutoPublish" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "galleryAutoPublishedAt" TIMESTAMP(3);
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "customGallery" BOOLEAN NOT NULL DEFAULT false;

-- Genius accounts' saved Event defaults: both on (accounts without saved defaults get them from the code)
UPDATE "genie_defaults" d SET "sharingUploadAll" = true, "galleryAutoPublish" = true
FROM "tenants" t WHERE t.id = d."tenantId" AND t.product = 'crm';

-- Existing events keep today's behaviour: their Gallery section is marked as set on the event, so the new defaults
-- don't reach them (an operator can still turn it on, or reset it to the defaults, on the event)
UPDATE "event_genie_settings" SET "customGallery" = true WHERE "customGallery" = false;

COMMIT;

-- Check: 5 columns, then Genius accounts with both defaults on, and events kept as they were
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'genie_defaults' AND column_name IN ('sharingUploadAll', 'galleryAutoPublish'))
   OR (table_name = 'event_genie_settings' AND column_name IN ('galleryAutoPublish', 'galleryAutoPublishedAt', 'customGallery'))
UNION ALL SELECT 'Genius defaults on: ' || count(*) FROM "genie_defaults" WHERE "galleryAutoPublish"
UNION ALL SELECT 'existing events kept: ' || count(*) FROM "event_genie_settings" WHERE "customGallery";
