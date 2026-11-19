-- BoothGen 2.121.0: Geniefied, the AI photo booth (Genie P13).
-- Run in the Neon SQL Editor on the PRODUCTION branch BEFORE the code deploys. Adds two tables (themes, renders) and
-- columns on events' Genie settings, payments and shares, all off or empty, and the 12 Standard themes without samples
-- (not offered to guests until each has a sample). Geniefied stays hidden until "Geniefied available" is turned on in
-- Super Admin → Genie Usage. Nothing is changed or dropped. Safe to run more than once.
BEGIN;

ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiMode" TEXT NOT NULL DEFAULT 'beforeStart';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiThemeIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiFixedThemeId" TEXT;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiConsentText" TEXT;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiWaitSeconds" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "event_genie_settings" ADD COLUMN IF NOT EXISTS "aiReadyText" TEXT;
ALTER TABLE "genie_event_payments" ADD COLUMN IF NOT EXISTS "aiRenders" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "genie_shares" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'photos';

CREATE TABLE IF NOT EXISTS "genie_ai_themes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sample" JSONB,
    "thumbnail" JSONB,
    "fastModel" TEXT,
    "qualityModel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_ai_themes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "genie_ai_themes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genie_ai_themes_tenantId_idx" ON "genie_ai_themes"("tenantId");

CREATE TABLE IF NOT EXISTS "genie_ai_renders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionClientId" TEXT NOT NULL,
    "shotIndex" INTEGER NOT NULL,
    "themeId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "model" TEXT,
    "trial" BOOLEAN NOT NULL DEFAULT false,
    "inputKey" TEXT NOT NULL,
    "resultKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "message" TEXT,
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "consentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "consentTextSha256" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "genie_ai_renders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "genie_ai_renders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "genie_ai_renders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "genie_ai_renders_tenantId_idx" ON "genie_ai_renders"("tenantId");
CREATE INDEX IF NOT EXISTS "genie_ai_renders_eventId_status_idx" ON "genie_ai_renders"("eventId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "genie_ai_renders_eventId_idempotencyKey_key" ON "genie_ai_renders"("eventId", "idempotencyKey");

-- The 12 Standard themes (prompts for G to review; samples added in Super Admin → AI themes)
INSERT INTO "genie_ai_themes" ("id", "tenantId", "name", "prompt", "sortOrder", "createdAt", "updatedAt") VALUES
  ('std-oil-painting', NULL, 'Oil painting', 'Turn it into a classical oil painting on canvas: rich colors, visible brush strokes, soft gallery lighting, a dark painterly background.', 0, now(), now()),
  ('std-3d-animated', NULL, '3D animated', 'Turn it into a frame from a modern 3D animated family film: friendly stylized characters, big expressive eyes, soft studio lighting, a colorful simple background.', 1, now(), now()),
  ('std-anime', NULL, 'Anime', 'Turn it into a hand-drawn anime illustration: clean line art, cel shading, bright colors, a soft sky background.', 2, now(), now()),
  ('std-comic-book', NULL, 'Comic book', 'Turn it into a classic comic book panel: bold ink outlines, halftone dots, flat bright colors, a dynamic action background. No speech bubbles or text.', 3, now(), now()),
  ('std-renaissance', NULL, 'Renaissance portrait', 'Turn it into an Italian Renaissance portrait: period clothing in rich fabrics, soft sfumato light, a landscape seen through an arch behind them.', 4, now(), now()),
  ('std-superhero', NULL, 'Superhero', 'Turn everyone into original superheroes with their own colorful costumes and capes (no existing characters or logos), standing heroically over a city skyline at sunset.', 5, now(), now()),
  ('std-red-carpet', NULL, 'Red carpet', 'Put them on a glamorous red carpet premiere: elegant evening wear, camera flashes, velvet ropes and a blurred crowd behind them.', 6, now(), now()),
  ('std-gatsby', NULL, '1920s Gatsby', 'Turn it into a 1920s Gatsby party: art deco ballroom, flapper dresses, pearls and tuxedos, warm golden light, a sepia-gold film look.', 7, now(), now()),
  ('std-cyberpunk', NULL, 'Cyberpunk', 'Turn it into a cyberpunk scene: neon-lit rainy city street at night, futuristic jackets with glowing accents, pink and teal reflections.', 8, now(), now()),
  ('std-fairy-tale', NULL, 'Fairy tale', 'Turn it into a storybook fairy tale illustration: enchanted forest with a castle in the distance, royal and magical costumes, soft watercolor-like light.', 9, now(), now()),
  ('std-watercolor', NULL, 'Watercolor', 'Turn it into a loose watercolor painting on textured paper: soft washes, gentle color bleeds, a light airy background.', 10, now(), now()),
  ('std-vintage-film', NULL, 'Vintage film', 'Turn it into a vintage 1970s film photograph: warm faded colors, soft grain, slight light leaks, retro clothing and hairstyles.', 11, now(), now())
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- Check: 9 columns, 2 tables, then the Standard themes
SELECT table_name || '.' || column_name AS item FROM information_schema.columns
WHERE (table_name = 'event_genie_settings' AND column_name IN ('aiEnabled', 'aiMode', 'aiThemeIds', 'aiFixedThemeId', 'aiConsentText', 'aiWaitSeconds', 'aiReadyText'))
   OR (table_name = 'genie_event_payments' AND column_name = 'aiRenders')
   OR (table_name = 'genie_shares' AND column_name = 'kind')
UNION ALL SELECT 'table ' || table_name FROM information_schema.tables WHERE table_name IN ('genie_ai_themes', 'genie_ai_renders')
UNION ALL SELECT 'Standard themes: ' || count(*) FROM "genie_ai_themes" WHERE "tenantId" IS NULL;
