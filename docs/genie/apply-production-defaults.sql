-- Genie event defaults (2.62.0): run once on the PRODUCTION branch in the Neon SQL Editor, BEFORE deploying.
-- All or nothing. Adds one table and four yes/no columns (existing events = customized, so nothing changes for them).
-- If it says something already exists, stop: it was already applied.
BEGIN;

ALTER TABLE "event_genie_settings" ADD COLUMN     "customCapture" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customPrinting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customSharing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customTimeZone" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "genie_defaults" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "shotCount" INTEGER NOT NULL DEFAULT 3,
    "initialCountdownSeconds" INTEGER NOT NULL DEFAULT 5,
    "betweenShotsCountdownSeconds" INTEGER NOT NULL DEFAULT 3,
    "showPerShotPreview" BOOLEAN NOT NULL DEFAULT true,
    "allowPerShotRetake" BOOLEAN NOT NULL DEFAULT true,
    "perShotPreviewSeconds" INTEGER NOT NULL DEFAULT 2,
    "allowReviewRetake" BOOLEAN NOT NULL DEFAULT false,
    "retakesPerShot" INTEGER NOT NULL DEFAULT 1,
    "idleTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "qrEnabled" BOOLEAN NOT NULL DEFAULT true,
    "guestLinkScope" TEXT NOT NULL DEFAULT 'own',
    "smsBody" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "smsConsentText" TEXT NOT NULL,
    "printingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "printMaxCopies" INTEGER NOT NULL DEFAULT 4,
    "printDefaultCopies" INTEGER NOT NULL DEFAULT 1,
    "templateIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genie_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "genie_defaults_tenantId_key" ON "genie_defaults"("tenantId");

ALTER TABLE "genie_defaults" ADD CONSTRAINT "genie_defaults_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
