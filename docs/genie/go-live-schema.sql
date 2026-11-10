-- Genie go-live: schema changes from main's prisma/schema.prisma to claude/genie-api-ef545d (780c46d5).
-- Generated with: prisma migrate diff --from-schema-datamodel <main schema> --to-schema-datamodel prisma/schema.prisma --script
-- Additive only: no DROP, no column type change, no NOT NULL without a default on an existing table.
-- Applied in this repo with 'prisma db push' (see docs/genie/go-live.md); this file is for review and as a fallback.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "genieAttendantPinHash" TEXT,
ADD COLUMN     "genieEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "genieEnabledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gallery_assets" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "genieKind" TEXT,
ADD COLUMN     "genieSessionId" TEXT;

-- AlterTable
ALTER TABLE "booth_design_templates" ADD COLUMN     "alternateLayout" JSONB,
ADD COLUMN     "genieThumbnail" JSONB,
ADD COLUMN     "layout" JSONB;

-- CreateTable
CREATE TABLE "genie_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "appVersion" TEXT,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "storageFreeBytes" BIGINT,
    "storageTotalBytes" BIGINT,
    "storageReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genie_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_pairing_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genie_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_genie_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "shotCount" INTEGER NOT NULL DEFAULT 3,
    "initialCountdownSeconds" INTEGER NOT NULL DEFAULT 5,
    "betweenShotsCountdownSeconds" INTEGER NOT NULL DEFAULT 3,
    "showPerShotPreview" BOOLEAN NOT NULL DEFAULT true,
    "allowPerShotRetake" BOOLEAN NOT NULL DEFAULT true,
    "perShotPreviewSeconds" INTEGER NOT NULL DEFAULT 2,
    "allowReviewRetake" BOOLEAN NOT NULL DEFAULT false,
    "retakesPerShot" INTEGER NOT NULL DEFAULT 1,
    "idleTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "processing" JSONB NOT NULL DEFAULT '[]',
    "guestFiltersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultFilterId" TEXT NOT NULL DEFAULT 'original',
    "filters" JSONB NOT NULL DEFAULT '[{"id":"original","name":"Original","steps":[]}]',
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
    "maxDevices" INTEGER NOT NULL DEFAULT 2,
    "bundleVersion" INTEGER NOT NULL DEFAULT 1,
    "bundleHash" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_genie_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "deviceId" TEXT,
    "clientId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genie_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_shares" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "firstName" TEXT,
    "smsConsentAt" TIMESTAMP(3),
    "smsConsentText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genie_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_print_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT,
    "clientId" TEXT NOT NULL,
    "prints" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "printCountAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genie_print_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_genie_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layout" JSONB NOT NULL,
    "alternateLayout" JSONB,
    "thumbnail" JSONB,
    "libraryTemplateId" TEXT,
    "designId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_genie_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_messaging_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "twilioAccountSid" TEXT,
    "twilioAuthTokenEnc" TEXT,
    "twilioMessagingServiceSid" TEXT,
    "twilioFromNumber" TEXT,
    "smsTestedAt" TIMESTAMP(3),
    "smsTestError" TEXT,
    "emailProvider" TEXT,
    "emailFromName" TEXT,
    "emailFromAddress" TEXT,
    "resendApiKeyEnc" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecurity" TEXT,
    "smtpUsername" TEXT,
    "smtpPasswordEnc" TEXT,
    "emailTestedAt" TIMESTAMP(3),
    "emailTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genie_messaging_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genie_event_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "genie_event_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "genie_devices_tokenHash_key" ON "genie_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "genie_devices_tenantId_idx" ON "genie_devices"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_pairing_codes_code_key" ON "genie_pairing_codes"("code");

-- CreateIndex
CREATE INDEX "genie_pairing_codes_tenantId_idx" ON "genie_pairing_codes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "event_genie_settings_eventId_key" ON "event_genie_settings"("eventId");

-- CreateIndex
CREATE INDEX "event_genie_settings_tenantId_idx" ON "event_genie_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_sessions_clientId_key" ON "genie_sessions"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_sessions_publicToken_key" ON "genie_sessions"("publicToken");

-- CreateIndex
CREATE INDEX "genie_sessions_tenantId_idx" ON "genie_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "genie_sessions_eventId_idx" ON "genie_sessions"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_shares_clientId_key" ON "genie_shares"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_shares_providerMessageId_key" ON "genie_shares"("providerMessageId");

-- CreateIndex
CREATE INDEX "genie_shares_tenantId_idx" ON "genie_shares"("tenantId");

-- CreateIndex
CREATE INDEX "genie_shares_sessionId_idx" ON "genie_shares"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_print_reports_clientId_key" ON "genie_print_reports"("clientId");

-- CreateIndex
CREATE INDEX "genie_print_reports_eventId_idx" ON "genie_print_reports"("eventId");

-- CreateIndex
CREATE INDEX "event_genie_templates_eventId_idx" ON "event_genie_templates"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_messaging_configs_tenantId_key" ON "genie_messaging_configs"("tenantId");

-- CreateIndex
CREATE INDEX "genie_event_devices_deviceId_idx" ON "genie_event_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "genie_event_devices_eventId_deviceId_key" ON "genie_event_devices"("eventId", "deviceId");

-- CreateIndex
CREATE INDEX "gallery_assets_genieSessionId_idx" ON "gallery_assets"("genieSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_assets_galleryId_clientId_key" ON "gallery_assets"("galleryId", "clientId");

-- AddForeignKey
ALTER TABLE "gallery_assets" ADD CONSTRAINT "gallery_assets_genieSessionId_fkey" FOREIGN KEY ("genieSessionId") REFERENCES "genie_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_devices" ADD CONSTRAINT "genie_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_pairing_codes" ADD CONSTRAINT "genie_pairing_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_pairing_codes" ADD CONSTRAINT "genie_pairing_codes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "genie_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_genie_settings" ADD CONSTRAINT "event_genie_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_genie_settings" ADD CONSTRAINT "event_genie_settings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_sessions" ADD CONSTRAINT "genie_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_sessions" ADD CONSTRAINT "genie_sessions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_sessions" ADD CONSTRAINT "genie_sessions_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_sessions" ADD CONSTRAINT "genie_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "genie_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_shares" ADD CONSTRAINT "genie_shares_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_shares" ADD CONSTRAINT "genie_shares_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_shares" ADD CONSTRAINT "genie_shares_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "genie_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_print_reports" ADD CONSTRAINT "genie_print_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_print_reports" ADD CONSTRAINT "genie_print_reports_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_print_reports" ADD CONSTRAINT "genie_print_reports_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "genie_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_genie_templates" ADD CONSTRAINT "event_genie_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_genie_templates" ADD CONSTRAINT "event_genie_templates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_messaging_configs" ADD CONSTRAINT "genie_messaging_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_event_devices" ADD CONSTRAINT "genie_event_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_event_devices" ADD CONSTRAINT "genie_event_devices_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genie_event_devices" ADD CONSTRAINT "genie_event_devices_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "genie_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

