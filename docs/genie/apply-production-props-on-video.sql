-- BoothGen 2.132.0: Props on video (Genie P14.1). The prop a guest wore in a Video Booth video (GalleryUpload.propId).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds one empty column; nothing is
-- changed or dropped. Safe to run more than once.
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "propId" TEXT;

-- Check: should return 1 row
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE table_name = 'gallery_assets' AND column_name = 'propId';
