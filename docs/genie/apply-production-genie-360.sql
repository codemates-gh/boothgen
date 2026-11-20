-- BoothGen 2.131.0: Genie 360 (Genie P15, the spinner booth). The event's 360 settings, 360 sessions and clips,
-- 360 panorama backdrops, and the Standard libraries Super Admin manages (360 styles, music, music links, animated
-- overlays). Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds columns and tables only
-- (all empty / off); nothing is changed or dropped. Safe to run more than once.
BEGIN;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "spin360" JSONB;
ALTER TABLE "genie_sessions" ADD COLUMN IF NOT EXISTS "mode" TEXT;
ALTER TABLE "genie_sessions" ADD COLUMN IF NOT EXISTS "styleId" TEXT;
ALTER TABLE "gallery_assets" ADD COLUMN IF NOT EXISTS "genieMode" TEXT;
ALTER TABLE "genie_backdrops" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "genie_spin_styles" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "captureFps" INTEGER NOT NULL DEFAULT 120,
  "segments" JSONB NOT NULL,
  "defaultMusicId" TEXT,
  "defaultEffects" JSONB NOT NULL DEFAULT '{}',
  "sampleVideo" JSONB,
  "samplePoster" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "genie_spin_styles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "genie_music_tracks" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "moods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "file" JSONB NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "credit" TEXT,
  "licenseNotes" TEXT,
  "rightsConfirmedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "genie_music_tracks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "genie_music_tracks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genie_music_tracks_tenantId_idx" ON "genie_music_tracks"("tenantId");

CREATE TABLE IF NOT EXISTS "genie_music_links" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "genie_music_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "genie_spin_overlays" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "file" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "genie_spin_overlays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "genie_spin_overlays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genie_spin_overlays_tenantId_idx" ON "genie_spin_overlays"("tenantId");
COMMIT;

-- Check: should return 9 rows
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'event_genie_settings' AND column_name = 'spin360')
   OR (table_name = 'genie_sessions' AND column_name IN ('mode', 'styleId'))
   OR (table_name = 'gallery_assets' AND column_name = 'genieMode')
   OR (table_name = 'genie_backdrops' AND column_name = 'tags')
   OR (table_name IN ('genie_spin_styles', 'genie_music_tracks', 'genie_music_links', 'genie_spin_overlays') AND column_name = 'id');
