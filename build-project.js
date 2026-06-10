#!/usr/bin/env node
/**
 * Photo Booth CRM — build-project.js
 * Run:  node build-project.js
 * Creates ./photo-booth-crm/ with the complete project.
 */
const fs   = require('fs');
const path = require('path');
const ROOT = path.join(process.cwd(), 'photo-booth-crm');

function w(p, content) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}

console.log('\n\ud83d\udce6 Building Photo Booth CRM...\n');

// ─── 1. CONFIGURATION ─────────────────────────────────────────────────────────

w('package.json', JSON.stringify({
  name: 'photo-booth-crm', version: '0.1.0', private: true,
  scripts: {
    dev: 'next dev',
    build: 'next build',
    start: 'next start',
    db: 'prisma generate && prisma db push',
    seed: 'ts-node --compiler-options \'{"module":"CommonJS"}\' prisma/seed.ts',
    'inngest:dev': 'npx inngest-cli@latest dev -u http://localhost:3000/api/inngest',
  },
  dependencies: {
    next: '^14.2.5', react: '^18.3.0', 'react-dom': '^18.3.0',
    '@clerk/nextjs': '^5.2.0', '@prisma/client': '^5.14.0',
    '@vercel/blob': '^0.23.0', '@react-pdf/renderer': '^3.4.0',
    inngest: '^3.19.0', resend: '^3.2.0', stripe: '^15.7.0',
    svix: '^1.15.0', zod: '^3.23.0', 'date-fns': '^3.6.0',
    'class-variance-authority': '^0.7.0', clsx: '^2.1.1',
    'tailwind-merge': '^2.3.0', 'lucide-react': '^0.383.0',
    'react-hook-form': '^7.51.5', '@hookform/resolvers': '^3.4.0',
  },
  devDependencies: {
    prisma: '^5.14.0', typescript: '^5.4.0',
    '@types/react': '^18.3.0', '@types/node': '^20.0.0',
    tailwindcss: '^3.4.0', autoprefixer: '^10.4.0',
    postcss: '^8.4.0', 'ts-node': '^10.9.0',
  },
}, null, 2));

w('next.config.ts', `import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
};
export default nextConfig;
`);

w('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2017', lib: ['dom','dom.iterable','esnext'], allowJs: true,
    skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true,
    module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true,
    isolatedModules: true, jsx: 'preserve', incremental: true,
    plugins: [{ name: 'next' }],
    paths: { '@/*': ['./src/*'] },
  },
  include: ['next-env.d.ts','**/*.ts','**/*.tsx','.next/types/**/*.ts'],
  exclude: ['node_modules'],
}, null, 2));

w('tailwind.config.ts', `import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F97316', dark: '#EA6100', light: '#FED7AA',
          surface: '#FFF7ED',
        },
        canvas: '#0F0F14',
        sidebar: { bg: '#0F0F14', hover: '#1C1C24', active: '#262630', text: '#A1A1AA', textActive: '#FFFFFF' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
`);

w('postcss.config.js', `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`);

w('.env.example', `# ─── DATABASE (Neon) ──────────────────────────────────────────────────
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/photobooth?sslmode=require"

# ─── CLERK AUTH ────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# ─── STRIPE PLATFORM BILLING ──────────────────────────────────────────
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# ─── STRIPE CONNECT ────────────────────────────────────────────────────
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..."
STRIPE_PLATFORM_FEE_PERCENT="2"

# ─── EMAIL (Resend) ────────────────────────────────────────────────────
RESEND_API_KEY="re_..."
EMAIL_FROM="noreply@yourdomain.com"

# ─── FILE STORAGE (Vercel Blob) ────────────────────────────────────────
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."

# ─── BACKGROUND JOBS (Inngest) ─────────────────────────────────────────
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."

# ─── APP ───────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://yourapp.vercel.app"
NEXT_PUBLIC_APP_DOMAIN="yourapp.vercel.app"
`);


// ─── 2. PRISMA SCHEMA ──────────────────────────────────────────────────────────

w('prisma/schema.prisma', `
generator client {
  provider = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum GlobalRole { SUPER_ADMIN USER }
enum TenantRole { HOST_ADMIN TEAM_MEMBER }
enum MembershipStatus { INVITED ACTIVE SUSPENDED }
enum TenantStatus { TRIAL ACTIVE SUSPENDED CANCELLED }
enum EventStatus { LEAD QUOTED BOOKED IN_PROGRESS COMPLETED CANCELLED }
enum InvoiceStatus { DRAFT SENT PARTIALLY_PAID PAID OVERDUE CANCELLED }
enum ContractStatus { DRAFT SENT_TO_CLIENT CLIENT_SIGNED HOST_SIGNED FULLY_EXECUTED VOIDED }
enum AutomationTrigger {
  LEAD_CREATED QUOTE_SENT BOOKING_CONFIRMED
  EVENT_DATE_MINUS_14_DAYS EVENT_DATE_MINUS_7_DAYS EVENT_DATE_MINUS_1_DAY
  EVENT_DATE_PLUS_1_DAY EVENT_DATE_PLUS_3_DAYS
  INVOICE_SENT PAYMENT_RECEIVED CONTRACT_SENT CONTRACT_FULLY_EXECUTED GALLERY_PUBLISHED
}
enum AutomationActionType { EMAIL SMS }
enum AutomationExecutionStatus { SCHEDULED SENT FAILED SKIPPED }
enum GalleryApprovalStatus { PENDING_UPLOAD PENDING_REVIEW APPROVED CHANGES_REQUESTED }
enum AssetType { PHOTO GIF VIDEO OVERLAY_TEMPLATE PRINT_TEMPLATE }
enum AssetApprovalStatus { PENDING APPROVED CHANGES_REQUESTED }
enum StripeConnectStatus { NOT_CONNECTED ONBOARDING_INITIATED ACTIVE RESTRICTED DEAUTHORIZED }
enum SubscriptionPlan { FREE_TRIAL MONTHLY ANNUAL }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELLED UNPAID INCOMPLETE INCOMPLETE_EXPIRED }

model Tenant {
  id          String       @id @default(cuid())
  clerkOrgId  String?      @unique
  name        String
  slug        String       @unique
  status      TenantStatus @default(TRIAL)
  trialEndsAt DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  memberships          TenantMembership[]
  branding             TenantBranding?
  clients              Client[]
  events               Event[]
  invoices             Invoice[]
  contracts            Contract[]
  contractTemplates    ContractTemplate[]
  emailTemplates       EmailTemplate[]
  automationRules      AutomationRule[]
  automationExecutions AutomationExecution[]
  galleries            Gallery[]
  stripeConnect        StripeConnectAccount?
  stripeSubscription   StripeSubscription?
  apiKeys              TenantApiKey[]
  leadSubmissions      LeadSubmission[]
  auditLogs            AuditLog[]
  @@map("tenants")
}

model User {
  id           String     @id @default(cuid())
  clerkUserId  String?    @unique
  email        String     @unique
  name         String
  avatarUrl    String?
  globalRole   GlobalRole @default(USER)
  lastLoginAt  DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  memberships          TenantMembership[]
  hostSignedContracts  Contract[]            @relation("HostSignedBy")
  eventAssignments     EventAssignment[]
  automationExecutions AutomationExecution[] @relation("ExecutionSentBy")
  auditLogs            AuditLog[]
  @@map("users")
}

model TenantMembership {
  id          String           @id @default(cuid())
  tenantId    String
  userId      String
  role        TenantRole       @default(TEAM_MEMBER)
  status      MembershipStatus @default(INVITED)
  inviteToken String?          @unique
  invitedAt   DateTime         @default(now())
  joinedAt    DateTime?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([tenantId, userId])
  @@index([tenantId])
  @@map("tenant_memberships")
}

model TenantBranding {
  id                String   @id @default(cuid())
  tenantId          String   @unique
  companyName       String?
  logoUrl           String?
  faviconUrl        String?
  primaryColor      String   @default("#F97316")
  secondaryColor    String   @default("#EA6100")
  accentColor       String   @default("#FED7AA")
  emailHeaderHtml   String?
  invoiceFooterText String?
  portalDomain      String?  @unique
  replyToEmail      String?
  supportPhone      String?
  websiteUrl        String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("tenant_branding")
}

model TenantApiKey {
  id         String    @id @default(cuid())
  tenantId   String
  name       String
  keyHash    String    @unique
  prefix     String
  lastUsedAt DateTime?
  expiresAt  DateTime?
  isActive   Boolean   @default(true)
  createdAt  DateTime  @default(now())
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leadSubmissions LeadSubmission[]
  @@index([tenantId])
  @@map("tenant_api_keys")
}

model Client {
  id           String   @id @default(cuid())
  tenantId     String
  firstName    String
  lastName     String
  email        String
  phone        String?
  company      String?
  addressLine1 String?
  city         String?
  state        String?
  postalCode   String?
  country      String?
  notes        String?  @db.Text
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  events    Event[]
  invoices  Invoice[]
  contracts Contract[]
  leads     LeadSubmission[]
  @@unique([tenantId, email])
  @@index([tenantId])
  @@map("clients")
}

model Event {
  id            String      @id @default(cuid())
  tenantId      String
  clientId      String
  portalToken   String      @unique @default(cuid())
  title         String
  status        EventStatus @default(LEAD)
  eventDate     DateTime
  setupTime     DateTime?
  startTime     DateTime?
  endTime       DateTime?
  venueName     String?
  venueAddress  String?
  venueCity     String?
  venueState    String?
  packageName   String?
  packageNotes  String?     @db.Text
  internalNotes String?     @db.Text
  guestCount    Int?
  hearAboutUs   String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  tenant               Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client               Client                @relation(fields: [clientId], references: [id])
  assignments          EventAssignment[]
  invoices             Invoice[]
  contracts            Contract[]
  gallery              Gallery?
  automationExecutions AutomationExecution[]
  leadSubmission       LeadSubmission?       @relation("LeadConvertedFrom")
  @@index([tenantId])
  @@index([tenantId, eventDate])
  @@map("events")
}

model EventAssignment {
  id        String   @id @default(cuid())
  eventId   String
  userId    String
  tenantId  String
  role      String?
  notes     String?
  createdAt DateTime @default(now())
  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id])
  @@unique([eventId, userId])
  @@map("event_assignments")
}

model Invoice {
  id                    String        @id @default(cuid())
  tenantId              String
  clientId              String
  eventId               String?
  invoiceNumber         String
  status                InvoiceStatus @default(DRAFT)
  dueDate               DateTime?
  paidAt                DateTime?
  notes                 String?       @db.Text
  subtotalCents         Int           @default(0)
  taxRateBps            Int           @default(0)
  taxAmountCents        Int           @default(0)
  discountCents         Int           @default(0)
  totalCents            Int           @default(0)
  amountPaidCents       Int           @default(0)
  balanceDueCents       Int           @default(0)
  retainerPercent       Int?
  retainerAmountCents   Int?
  retainerPaidAt        DateTime?
  stripePaymentIntentId String?
  stripeInvoiceId       String?
  currency              String        @default("usd")
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt
  tenant    Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client    Client            @relation(fields: [clientId], references: [id])
  event     Event?            @relation(fields: [eventId], references: [id])
  lineItems InvoiceLineItem[]
  payments  Payment[]
  @@unique([tenantId, invoiceNumber])
  @@index([tenantId])
  @@map("invoices")
}

model InvoiceLineItem {
  id          String   @id @default(cuid())
  invoiceId   String
  description String
  quantity    Float    @default(1)
  unitCents   Int
  totalCents  Int
  sortOrder   Int      @default(0)
  taxable     Boolean  @default(true)
  createdAt   DateTime @default(now())
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@map("invoice_line_items")
}

model Payment {
  id                    String   @id @default(cuid())
  invoiceId             String
  tenantId              String
  amountCents           Int
  currency              String   @default("usd")
  stripeChargeId        String?  @unique
  stripePaymentIntentId String?
  paymentMethod         String?
  notes                 String?
  paidAt                DateTime @default(now())
  createdAt             DateTime @default(now())
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@map("payments")
}

model ContractTemplate {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  bodyHtml  String   @db.Text
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contracts Contract[]
  @@map("contract_templates")
}

model Contract {
  id                 String         @id @default(cuid())
  tenantId           String
  clientId           String
  eventId            String?
  templateId         String?
  title              String
  status             ContractStatus @default(DRAFT)
  templateContent    String         @db.Text
  renderedContent    String         @db.Text
  clientToken        String         @unique @default(cuid())
  clientSignatureData String?
  clientSignedAt     DateTime?
  clientIpAddress    String?
  clientUserAgent    String?
  hostSignatureData  String?
  hostSignedAt       DateTime?
  hostIpAddress      String?
  hostSignedByUserId String?
  pdfUrl             String?
  pdfLockedAt        DateTime?
  contentHash        String?
  voidedAt           DateTime?
  voidedReason       String?
  expiresAt          DateTime?
  createdAt          DateTime       @default(now())
  updatedAt          DateTime       @updatedAt
  tenant       Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client       Client            @relation(fields: [clientId], references: [id])
  event        Event?            @relation(fields: [eventId], references: [id])
  template     ContractTemplate? @relation(fields: [templateId], references: [id])
  hostSignedBy User?             @relation("HostSignedBy", fields: [hostSignedByUserId], references: [id])
  @@index([tenantId])
  @@index([clientToken])
  @@map("contracts")
}

model EmailTemplate {
  id          String   @id @default(cuid())
  tenantId    String?
  name        String
  subject     String
  previewText String?
  bodyHtml    String   @db.Text
  isGlobal    Boolean  @default(false)
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant          Tenant?          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  automationRules AutomationRule[]
  @@map("email_templates")
}

model AutomationRule {
  id                 String               @id @default(cuid())
  tenantId           String
  name               String
  description        String?
  isActive           Boolean              @default(true)
  trigger            AutomationTrigger
  triggerOffsetHours Int                  @default(0)
  actionType         AutomationActionType
  emailTemplateId    String?
  smsBody            String?
  sortOrder          Int                  @default(0)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
  tenant        Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  emailTemplate EmailTemplate?        @relation(fields: [emailTemplateId], references: [id])
  executions    AutomationExecution[]
  @@index([tenantId])
  @@map("automation_rules")
}

model AutomationExecution {
  id             String                    @id @default(cuid())
  tenantId       String
  ruleId         String
  eventId        String
  status         AutomationExecutionStatus @default(SCHEDULED)
  scheduledFor   DateTime
  executedAt     DateTime?
  sentByUserId   String?
  errorMessage   String?
  recipientEmail String?
  messagePreview String?
  createdAt      DateTime                  @default(now())
  updatedAt      DateTime                  @updatedAt
  tenant Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  rule   AutomationRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  event  Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  sentBy User?          @relation("ExecutionSentBy", fields: [sentByUserId], references: [id])
  @@index([scheduledFor, status])
  @@map("automation_executions")
}

model Gallery {
  id              String                @id @default(cuid())
  tenantId        String
  eventId         String                @unique
  title           String
  isPublished     Boolean               @default(false)
  accessCode      String?
  clientToken     String                @unique @default(cuid())
  approvalStatus  GalleryApprovalStatus @default(PENDING_UPLOAD)
  approvalDueDate DateTime?
  clientNotes     String?               @db.Text
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  tenant Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event  Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)
  assets GalleryAsset[]
  @@map("galleries")
}

model GalleryAsset {
  id             String              @id @default(cuid())
  galleryId      String
  assetType      AssetType
  url            String
  thumbnailUrl   String?
  filename       String
  fileSizeBytes  Int
  mimeType       String
  width          Int?
  height         Int?
  durationMs     Int?
  sortOrder      Int                 @default(0)
  approvalStatus AssetApprovalStatus @default(PENDING)
  clientNotes    String?
  isHero         Boolean             @default(false)
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
  gallery Gallery @relation(fields: [galleryId], references: [id], onDelete: Cascade)
  @@map("gallery_assets")
}

model LeadSubmission {
  id                 String    @id @default(cuid())
  tenantId           String
  apiKeyId           String?
  clientId           String?
  firstName          String
  lastName           String
  email              String
  phone              String?
  eventDate          DateTime?
  eventType          String?
  venueName          String?
  guestCount         Int?
  packageInterest    String?
  message            String?   @db.Text
  hearAboutUs        String?
  source             String    @default("iframe")
  referrerUrl        String?
  utmSource          String?
  utmMedium          String?
  utmCampaign        String?
  ipAddress          String?
  userAgent          String?
  convertedToEventId String?   @unique
  convertedAt        DateTime?
  isSpam             Boolean   @default(false)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  tenant           Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  apiKey           TenantApiKey? @relation(fields: [apiKeyId], references: [id])
  client           Client?       @relation(fields: [clientId], references: [id])
  convertedToEvent Event?        @relation("LeadConvertedFrom", fields: [convertedToEventId], references: [id])
  @@index([tenantId, createdAt])
  @@map("lead_submissions")
}

model StripeSubscription {
  id                     String             @id @default(cuid())
  tenantId               String             @unique
  stripeCustomerId       String             @unique
  stripeSubscriptionId   String?            @unique
  plan                   SubscriptionPlan   @default(FREE_TRIAL)
  status                 SubscriptionStatus @default(TRIALING)
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  trialStart             DateTime?
  trialEnd               DateTime?
  cancelAtPeriodEnd      Boolean            @default(false)
  cancelledAt            DateTime?
  stripePriceId          String?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("stripe_subscriptions")
}

model StripeConnectAccount {
  id               String              @id @default(cuid())
  tenantId         String              @unique
  stripeAccountId  String              @unique
  onboardingStatus StripeConnectStatus @default(NOT_CONNECTED)
  accountType      String              @default("express")
  chargesEnabled   Boolean             @default(false)
  payoutsEnabled   Boolean             @default(false)
  detailsSubmitted Boolean             @default(false)
  defaultCurrency  String              @default("usd")
  country          String?
  email            String?
  livemode         Boolean             @default(false)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("stripe_connect_accounts")
}

model AuditLog {
  id           String   @id @default(cuid())
  tenantId     String?
  userId       String?
  action       String
  resourceType String?
  resourceId   String?
  metadata     Json?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())
  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: SetNull)
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@index([tenantId])
  @@index([createdAt])
  @@map("audit_logs")
}
`);

// ─── 3. PRISMA SEED ─────────────────────────────────────────────────────────────

w('prisma/seed.ts', `
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Tenant 1 — Pixel Perfect Photo Booths
  const t1 = await prisma.tenant.upsert({
    where: { slug: 'pixel-perfect' },
    update: {},
    create: {
      name: 'Pixel Perfect Photo Booths',
      slug: 'pixel-perfect',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: {
        create: {
          companyName: 'Pixel Perfect Photo Booths',
          primaryColor: '#F97316',
          secondaryColor: '#EA6100',
          replyToEmail: 'hello@pixelperfect.example',
          supportPhone: '(512) 555-0101',
          websiteUrl: 'https://pixelperfect.example',
          invoiceFooterText: 'Thank you for choosing Pixel Perfect Photo Booths!',
        },
      },
    },
  });

  // Tenant 2 — Flash Frame Events
  const t2 = await prisma.tenant.upsert({
    where: { slug: 'flash-frame' },
    update: {},
    create: {
      name: 'Flash Frame Events',
      slug: 'flash-frame',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: {
        create: {
          companyName: 'Flash Frame Events',
          primaryColor: '#8B5CF6',
          secondaryColor: '#7C3AED',
          replyToEmail: 'hello@flashframe.example',
          supportPhone: '(512) 555-0202',
        },
      },
    },
  });

  // Default contract template for Tenant 1
  await prisma.contractTemplate.upsert({
    where: { id: 'seed-ct-1' },
    update: {},
    create: {
      id: 'seed-ct-1',
      tenantId: t1.id,
      name: 'Standard Event Agreement',
      isDefault: true,
      bodyHtml: \`<h2>EVENT SERVICES AGREEMENT</h2>
<p>This Agreement is entered into between {{host.company_name}} ("Company") and {{client.full_name}} ("Client").</p>
<h3>1. Event Details</h3>
<p>Event: {{event.title}}<br/>Date: {{event.date}}<br/>Venue: {{event.venue_name}}</p>
<h3>2. Services</h3>
<p>Company agrees to provide photo booth services as described in the package: {{event.package_name}}.</p>
<h3>3. Payment</h3>
<p>Total: {{invoice.total}}<br/>Retainer due at signing: {{invoice.retainer_amount}}<br/>Balance due: {{invoice.balance_due}}</p>
<h3>4. Cancellation Policy</h3>
<p>Cancellations made more than 30 days before the event date will forfeit the retainer. Cancellations within 30 days are subject to 50% of the total contract value.</p>
<h3>5. Agreement</h3>
<p>By signing below, both parties agree to the terms outlined in this agreement.</p>\`,
    },
  });

  // Default automation rules for Tenant 1
  const emailTpl = await prisma.emailTemplate.upsert({
    where: { id: 'seed-et-1' },
    update: {},
    create: {
      id: 'seed-et-1',
      tenantId: t1.id,
      name: 'New Lead — Auto Reply',
      subject: 'Thanks for reaching out, {{client.first_name}}!',
      bodyHtml: \`<p>Hi {{client.first_name}},</p>
<p>Thank you for your interest in {{host.company_name}}! We received your inquiry for {{event.date}} and will be in touch within 1 business day.</p>
<p>Warm regards,<br/>{{host.company_name}}</p>\`,
    },
  });

  await prisma.automationRule.upsert({
    where: { id: 'seed-ar-1' },
    update: {},
    create: {
      id: 'seed-ar-1',
      tenantId: t1.id,
      name: 'New Lead Auto-Reply',
      trigger: 'LEAD_CREATED',
      triggerOffsetHours: 0,
      actionType: 'EMAIL',
      emailTemplateId: emailTpl.id,
      isActive: true,
    },
  });

  // Sample client + event for Tenant 1
  const client1 = await prisma.client.upsert({
    where: { tenantId_email: { tenantId: t1.id, email: 'sarah.johnson@example.com' } },
    update: {},
    create: {
      tenantId: t1.id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@example.com',
      phone: '(512) 555-1234',
      city: 'Austin',
      state: 'TX',
    },
  });

  const event1 = await prisma.event.upsert({
    where: { id: 'seed-ev-1' },
    update: {},
    create: {
      id: 'seed-ev-1',
      tenantId: t1.id,
      clientId: client1.id,
      title: 'Johnson Wedding',
      status: 'BOOKED',
      eventDate: new Date(Date.now() + 30 * 86400000),
      startTime: new Date(Date.now() + 30 * 86400000 + 18 * 3600000),
      endTime: new Date(Date.now() + 30 * 86400000 + 22 * 3600000),
      venueName: 'The Driskill Hotel',
      venueAddress: '604 Brazos St',
      venueCity: 'Austin',
      venueState: 'TX',
      packageName: 'Deluxe 4-Hour Package',
      guestCount: 200,
    },
  });

  await prisma.invoice.upsert({
    where: { tenantId_invoiceNumber: { tenantId: t1.id, invoiceNumber: 'INV-2025-0001' } },
    update: {},
    create: {
      tenantId: t1.id,
      clientId: client1.id,
      eventId: event1.id,
      invoiceNumber: 'INV-2025-0001',
      status: 'PARTIALLY_PAID',
      totalCents: 150000,
      subtotalCents: 150000,
      retainerPercent: 25,
      retainerAmountCents: 37500,
      retainerPaidAt: new Date(),
      amountPaidCents: 37500,
      balanceDueCents: 112500,
      dueDate: new Date(Date.now() + 25 * 86400000),
      lineItems: {
        create: [
          { description: 'Deluxe 4-Hour Photo Booth Package', quantity: 1, unitCents: 120000, totalCents: 120000, sortOrder: 0 },
          { description: 'Custom Overlay Design (3 designs)', quantity: 1, unitCents: 20000, totalCents: 20000, sortOrder: 1 },
          { description: 'Extra Prints Bundle (100 prints)', quantity: 1, unitCents: 10000, totalCents: 10000, sortOrder: 2 },
        ],
      },
    },
  });

  console.log('Seed complete.');
  console.log('NOTE: To make yourself a Super Admin, sign up via Clerk,');
  console.log('      then run: UPDATE users SET global_role=\\'SUPER_ADMIN\\' WHERE email=\\'your@email.com\\';');
}

main().catch(console.error).finally(() => prisma.$disconnect());
`);

// ─── 4. CORE LIB FILES ────────────────────────────────────────────────────────

w('src/lib/prisma/client.ts', `
import { PrismaClient } from '@prisma/client';
declare global { var prisma: PrismaClient | undefined; }
export const prisma = global.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error'] : [] });
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;
`);

w('src/lib/utils.ts', `
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function fmtCents(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
export function fmtDate(d: Date | string, fmt = 'MMM d, yyyy') {
  const { format } = require('date-fns');
  return format(new Date(d), fmt);
}
export function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
`);

w('src/lib/rate-limit.ts', `
const windows = new Map<string, number[]>();
export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now(); const cutoff = now - windowMs;
  const hits = (windows.get(key) ?? []).filter(t => t > cutoff);
  if (hits.length >= limit) return { success: false };
  hits.push(now); windows.set(key, hits);
  if (windows.size > 5000) for (const [k, v] of windows) { if (v.every(t => t <= cutoff)) windows.delete(k); }
  return { success: true };
}
export const checkLeadRateLimit = (ip: string) => checkRateLimit('lead:' + ip, 5, 600000);
export const checkSigningRateLimit = (ip: string) => checkRateLimit('sign:' + ip, 10, 600000);
`);

w('src/lib/storage/blob.ts', `
import { put, del } from '@vercel/blob';
export async function uploadContractPdf(buf: Buffer, blobPath: string): Promise<string> {
  const blob = await put(blobPath, buf, { access: 'public', contentType: 'application/pdf', addRandomSuffix: false, cacheControlMaxAge: 31536000 });
  return blob.url;
}
export async function uploadGalleryAsset(buf: Buffer, path: string, mimeType: string): Promise<string> {
  const blob = await put(path, buf, { access: 'public', contentType: mimeType, addRandomSuffix: false });
  return blob.url;
}
export async function deleteBlob(url: string) { try { await del(url); } catch (e) { console.warn('blob delete failed', e); } }
`);

w('src/lib/auth/guards.ts', `
import { prisma } from '@/lib/prisma/client';
import type { TenantRole } from '@prisma/client';
const RANK: Record<TenantRole, number> = { HOST_ADMIN: 100, TEAM_MEMBER: 10 };
export async function requireTenantRole(userId: string, min: TenantRole, tenantId?: string) {
  const where = tenantId ? { userId, tenantId, status: 'ACTIVE' as const } : { userId, status: 'ACTIVE' as const };
  const m = await prisma.tenantMembership.findFirst({ where, include: { tenant: true } });
  if (!m || RANK[m.role] < RANK[min]) return null;
  return m;
}
export async function requireSuperAdmin(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, globalRole: true } });
  return u?.globalRole === 'SUPER_ADMIN' ? u : null;
}
`);

w('src/lib/contracts/merge-tags.ts', `
export type MergeCtx = {
  client: { first_name: string; last_name: string; full_name: string; email: string; phone?: string; company?: string };
  event: { title: string; date: string; time?: string; venue_name?: string; venue_address?: string; package_name?: string; guest_count?: string };
  invoice: { number?: string; total?: string; balance_due?: string; retainer_amount?: string; due_date?: string; payment_link?: string };
  contract: { link?: string; expiry?: string; title?: string };
  host: { company_name: string; email?: string; phone?: string; website?: string };
};
export function parseMergeTags(tpl: string, ctx: MergeCtx): string {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (match, raw: string) => {
    const keys = raw.trim().split('.');
    let v: any = ctx;
    for (const k of keys) { if (v == null) return match; v = v[k as keyof typeof v]; }
    return v != null ? String(v) : match;
  });
}
export function buildCtx(params: {
  client: { firstName: string; lastName: string; email: string; phone?: string | null; company?: string | null };
  event: { title: string; eventDate: Date; startTime?: Date | null; endTime?: Date | null; venueName?: string | null; venueAddress?: string | null; venueCity?: string | null; venueState?: string | null; packageName?: string | null; guestCount?: number | null };
  invoice?: { invoiceNumber: string; totalCents: number; balanceDueCents: number; retainerAmountCents?: number | null; dueDate?: Date | null; currency?: string } | null;
  contract?: { clientToken: string; title: string; expiresAt?: Date | null } | null;
  branding: { companyName?: string | null; replyToEmail?: string | null; supportPhone?: string | null; websiteUrl?: string | null };
  appUrl: string;
}): MergeCtx {
  const { format } = require('date-fns');
  const { client, event, invoice, contract, branding, appUrl } = params;
  const fmt = (cents: number, cur = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);
  return {
    client: { first_name: client.firstName, last_name: client.lastName, full_name: client.firstName + ' ' + client.lastName, email: client.email, phone: client.phone ?? undefined, company: client.company ?? undefined },
    event: { title: event.title, date: format(event.eventDate, 'EEEE, MMMM d, yyyy'), time: event.startTime ? format(event.startTime, 'h:mm a') + (event.endTime ? ' \u2013 ' + format(event.endTime, 'h:mm a') : '') : undefined, venue_name: event.venueName ?? undefined, venue_address: [event.venueAddress, event.venueCity, event.venueState].filter(Boolean).join(', ') || undefined, package_name: event.packageName ?? undefined, guest_count: event.guestCount?.toString() },
    invoice: invoice ? { number: invoice.invoiceNumber, total: fmt(invoice.totalCents, invoice.currency), balance_due: fmt(invoice.balanceDueCents, invoice.currency), retainer_amount: invoice.retainerAmountCents ? fmt(invoice.retainerAmountCents, invoice.currency) : undefined, due_date: invoice.dueDate ? format(invoice.dueDate, 'MMMM d, yyyy') : undefined, payment_link: appUrl + '/portal/' } : {},
    contract: contract ? { link: appUrl + '/portal/' + contract.clientToken, expiry: contract.expiresAt ? format(contract.expiresAt, 'MMMM d, yyyy') : undefined, title: contract.title } : {},
    host: { company_name: branding.companyName ?? 'Your Company', email: branding.replyToEmail ?? undefined, phone: branding.supportPhone ?? undefined, website: branding.websiteUrl ?? undefined },
  };
}
`);

w('src/lib/contracts/pdf-generator.ts', `
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { format } from 'date-fns';
import { uploadContractPdf } from '@/lib/storage/blob';
import React from 'react';

export interface ContractPdfInput {
  contractId: string; tenantId: string; title: string; renderedContent: string;
  clientFullName: string; clientEmail: string; clientSignatureDataUrl: string; clientSignedAt: Date; clientIpAddress: string;
  hostFullName: string; hostEmail: string; hostSignatureDataUrl: string; hostSignedAt: Date; hostIpAddress: string;
  branding: { companyName: string; primaryColor: string; logoUrl?: string; invoiceFooterText?: string };
}

const S = (c: string) => StyleSheet.create({
  page: { paddingTop: 60, paddingBottom: 80, paddingHorizontal: 72, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: c, paddingBottom: 16, marginBottom: 24 },
  coName: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  meta: { fontSize: 8, color: '#6b7280' },
  banner: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: 8, marginBottom: 20, alignItems: 'center' },
  bannerTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c, letterSpacing: 0.5 },
  body: { fontSize: 10, lineHeight: 1.7, marginBottom: 24 },
  sigs: { flexDirection: 'row', gap: 40, marginTop: 36, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#d1d5db' },
  sigBlock: { flex: 1 },
  sigLbl: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 },
  sigWrap: { height: 60, borderBottomWidth: 1.5, borderBottomColor: '#374151', marginBottom: 6, justifyContent: 'flex-end' },
  sigImg: { height: 52, objectFit: 'contain' },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sigMeta: { fontSize: 8, color: '#6b7280', lineHeight: 1.5 },
  audit: { marginTop: 28, padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 },
  auditTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#374151', marginBottom: 6 },
  auditRow: { flexDirection: 'row', marginBottom: 3 },
  auditLbl: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: 120, color: '#374151' },
  auditVal: { fontSize: 7.5, color: '#6b7280', flex: 1 },
  hash: { fontSize: 7, color: '#9ca3af', fontFamily: 'Courier', marginTop: 4 },
});

function ContractDoc({ input, hash }: { input: ContractPdfInput; hash: string }) {
  const s = S(input.branding.primaryColor);
  const plain = input.renderedContent.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
  return (
    React.createElement(Document, { title: input.title },
      React.createElement(Page, { size: 'LETTER', style: s.page },
        React.createElement(View, { style: s.header },
          React.createElement(View, null,
            input.branding.logoUrl
              ? React.createElement(Image, { src: input.branding.logoUrl, style: { width: 120, height: 40, objectFit: 'contain' } })
              : React.createElement(Text, { style: s.coName }, input.branding.companyName)
          ),
          React.createElement(View, { style: { alignItems: 'flex-end' } },
            React.createElement(Text, { style: s.title }, input.title),
            React.createElement(Text, { style: s.meta }, 'ID: ' + input.contractId),
            React.createElement(Text, { style: s.meta }, 'Generated: ' + format(new Date(), 'MMMM d, yyyy'))
          )
        ),
        React.createElement(View, { style: s.banner }, React.createElement(Text, { style: s.bannerTxt }, 'FULLY EXECUTED \u2014 LOCKED AND LEGALLY BINDING')),
        React.createElement(View, null, React.createElement(Text, { style: s.body }, plain)),
        React.createElement(View, { style: s.sigs },
          React.createElement(View, { style: s.sigBlock },
            React.createElement(Text, { style: s.sigLbl }, 'Client Signature'),
            React.createElement(View, { style: s.sigWrap }, React.createElement(Image, { src: input.clientSignatureDataUrl, style: s.sigImg })),
            React.createElement(Text, { style: s.sigName }, input.clientFullName),
            React.createElement(Text, { style: s.sigMeta }, input.clientEmail),
            React.createElement(Text, { style: s.sigMeta }, format(input.clientSignedAt, "MMM d, yyyy 'at' h:mm a")),
            React.createElement(Text, { style: s.sigMeta }, 'IP: ' + input.clientIpAddress)
          ),
          React.createElement(View, { style: s.sigBlock },
            React.createElement(Text, { style: s.sigLbl }, input.branding.companyName + ' \u2014 Authorized'),
            React.createElement(View, { style: s.sigWrap }, React.createElement(Image, { src: input.hostSignatureDataUrl, style: s.sigImg })),
            React.createElement(Text, { style: s.sigName }, input.hostFullName),
            React.createElement(Text, { style: s.sigMeta }, input.hostEmail),
            React.createElement(Text, { style: s.sigMeta }, format(input.hostSignedAt, "MMM d, yyyy 'at' h:mm a")),
            React.createElement(Text, { style: s.sigMeta }, 'IP: ' + input.hostIpAddress)
          )
        ),
        React.createElement(View, { style: s.audit },
          React.createElement(Text, { style: s.auditTitle }, 'Document Integrity Record'),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Contract ID:'), React.createElement(Text, { style: s.auditVal }, input.contractId)),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Client signed:'), React.createElement(Text, { style: s.auditVal }, format(input.clientSignedAt, 'MMM d, yyyy h:mm:ss a') + ' from ' + input.clientIpAddress)),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Host signed:'), React.createElement(Text, { style: s.auditVal }, format(input.hostSignedAt, 'MMM d, yyyy h:mm:ss a') + ' from ' + input.hostIpAddress)),
          React.createElement(Text, { style: s.hash }, 'SHA-256: ' + hash),
          input.branding.invoiceFooterText ? React.createElement(Text, { style: s.auditVal }, input.branding.invoiceFooterText) : null
        )
      )
    )
  );
}

export async function generateLockedContractPdf(input: ContractPdfInput) {
  const raw = [input.contractId,input.renderedContent,input.clientSignatureDataUrl,input.clientSignedAt.toISOString(),input.clientIpAddress,input.hostSignatureDataUrl,input.hostSignedAt.toISOString(),input.hostIpAddress].join('|');
  const contentHash = createHash('sha256').update(raw).digest('hex');
  const buf = Buffer.from(await renderToBuffer(React.createElement(ContractDoc, { input, hash: contentHash })));
  const blobPath = 'contracts/' + input.tenantId + '/' + input.contractId + '/' + contentHash.slice(0,16) + '-signed.pdf';
  const pdfUrl = await uploadContractPdf(buf, blobPath);
  return { pdfUrl, contentHash };
}
`);

w('src/lib/email/send.ts', `
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM ?? 'noreply@example.com';

export async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html, replyTo });
    if (error) throw error;
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[EMAIL_SEND]', err);
    return { success: false, error: err };
  }
}

export async function sendContractLink(params: { to: string; firstName: string; companyName: string; contractTitle: string; portalUrl: string; expiresAt?: Date }) {
  const { to, firstName, companyName, contractTitle, portalUrl, expiresAt } = params;
  const exp = expiresAt ? '<p style="color:#6b7280;font-size:13px;">This link expires on ' + expiresAt.toLocaleDateString() + '.</p>' : '';
  return sendEmail(to, 'Please sign your contract: ' + contractTitle,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Hi ' + firstName + ',</h2>' +
    '<p>Your contract with ' + companyName + ' is ready to sign.</p>' +
    '<p><strong>' + contractTitle + '</strong></p>' +
    '<p style="margin:24px 0"><a href="' + portalUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; Sign Contract</a></p>' +
    exp + '<p style="color:#6b7280;font-size:12px;">If you did not expect this email, please ignore it.</p>' +
    '<p>Warm regards,<br/>' + companyName + '</p></div>'
  );
}

export async function sendInvoiceLink(params: { to: string; firstName: string; companyName: string; invoiceNumber: string; totalFormatted: string; portalUrl: string }) {
  const { to, firstName, companyName, invoiceNumber, totalFormatted, portalUrl } = params;
  return sendEmail(to, 'Invoice ' + invoiceNumber + ' from ' + companyName,
    '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">' +
    '<h2 style="font-size:20px;color:#111827">Hi ' + firstName + ',</h2>' +
    '<p>You have a new invoice from ' + companyName + '.</p>' +
    '<p><strong>Invoice ' + invoiceNumber + '</strong> &mdash; ' + totalFormatted + '</p>' +
    '<p style="margin:24px 0"><a href="' + portalUrl + '" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View &amp; Pay Invoice</a></p>' +
    '<p>Warm regards,<br/>' + companyName + '</p></div>'
  );
}
`);

w('src/lib/inngest/client.ts', `
import { Inngest } from 'inngest';
export const inngest = new Inngest({ id: 'photo-booth-crm' });
`);

w('src/lib/inngest/functions.ts', `
import { inngest } from './client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export const processAutomation = inngest.createFunction(
  { id: 'process-automation', retries: 3 },
  { event: 'automation/execute' },
  async ({ event: evt }) => {
    const { executionId } = evt.data;
    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: { rule: { include: { emailTemplate: true } }, event: { include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } }, tenant: { include: { branding: true } } } } },
    });
    if (!execution || execution.status !== 'SCHEDULED') return;
    if (execution.rule.actionType !== 'EMAIL' || !execution.rule.emailTemplate) {
      await prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SKIPPED' } });
      return;
    }
    const { event: ev } = execution;
    const ctx = buildCtx({ client: ev.client, event: ev, invoice: ev.invoices[0] ?? null, branding: ev.tenant.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' });
    const subject = parseMergeTags(execution.rule.emailTemplate.subject, ctx);
    const body = parseMergeTags(execution.rule.emailTemplate.bodyHtml, ctx);
    const result = await sendEmail(ev.client.email, subject, body);
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: result.success ? 'SENT' : 'FAILED', executedAt: new Date(), errorMessage: result.success ? null : String(result.error), recipientEmail: ev.client.email, messagePreview: subject },
    });
  }
);

export const scheduleLeadCreatedAutomations = inngest.createFunction(
  { id: 'schedule-lead-automations' },
  { event: 'lead/created' },
  async ({ event: evt }) => {
    const { tenantId } = evt.data;
    const rules = await prisma.automationRule.findMany({ where: { tenantId, trigger: 'LEAD_CREATED', isActive: true, actionType: 'EMAIL' } });
    return { scheduled: rules.length };
  }
);
`);

w('src/middleware.ts', `
import { authMiddleware } from '@clerk/nextjs';
import { NextResponse } from 'next/server';

export default authMiddleware({
  publicRoutes: ['/sign-in', '/sign-up', '/portal(.*)', '/embed(.*)', '/api/public(.*)', '/api/webhooks(.*)'],
  afterAuth(auth, req) {
    if (!auth.userId && !auth.isPublicRoute) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }
    if (auth.userId && !auth.orgId && req.nextUrl.pathname !== '/onboarding' && !req.nextUrl.pathname.startsWith('/api') && !req.nextUrl.pathname.startsWith('/sign')) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }
    const isSuperAdminRoute = req.nextUrl.pathname.startsWith('/super-admin') || req.nextUrl.pathname.startsWith('/api/super-admin');
    if (isSuperAdminRoute) {
      const meta = auth.sessionClaims?.metadata as any;
      if (meta?.globalRole !== 'SUPER_ADMIN') return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  },
});

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\\\..*).*)'] };
`);

// ─── 5. WEBHOOKS + API ROUTES ─────────────────────────────────────────────────

w('src/app/api/webhooks/clerk/route.ts', `
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = headers();
  const svixId = headersList.get('svix-id') ?? '';
  const svixTs = headersList.get('svix-timestamp') ?? '';
  const svixSig = headersList.get('svix-signature') ?? '';
  let evt: any;
  try {
    evt = new Webhook(process.env.CLERK_WEBHOOK_SECRET!).verify(body, { 'svix-id': svixId, 'svix-timestamp': svixTs, 'svix-signature': svixSig });
  } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }

  const { type, data } = evt;

  if (type === 'organization.created') {
    const slug = data.slug ?? data.id;
    await prisma.tenant.upsert({
      where: { clerkOrgId: data.id },
      update: { name: data.name },
      create: { clerkOrgId: data.id, name: data.name, slug, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 14 * 86400000), branding: { create: { companyName: data.name, primaryColor: '#F97316' } } },
    });
  }

  if (type === 'user.created' || type === 'user.updated') {
    const email = data.email_addresses?.[0]?.email_address ?? '';
    await prisma.user.upsert({
      where: { clerkUserId: data.id },
      update: { name: (data.first_name ?? '') + ' ' + (data.last_name ?? ''), email, avatarUrl: data.image_url },
      create: { clerkUserId: data.id, name: (data.first_name ?? '') + ' ' + (data.last_name ?? ''), email, avatarUrl: data.image_url },
    });
  }

  if (type === 'organizationMembership.created') {
    const org = await prisma.tenant.findFirst({ where: { clerkOrgId: data.organization?.id } });
    const user = await prisma.user.findFirst({ where: { clerkUserId: data.public_user_data?.user_id } });
    if (org && user) {
      const role = data.role === 'org:admin' ? 'HOST_ADMIN' : 'TEAM_MEMBER';
      await prisma.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: org.id, userId: user.id } }, update: { status: 'ACTIVE', role }, create: { tenantId: org.id, userId: user.id, role, status: 'ACTIVE', joinedAt: new Date() } });
    }
  }

  if (type === 'organizationMembership.deleted') {
    const org = await prisma.tenant.findFirst({ where: { clerkOrgId: data.organization?.id } });
    const user = await prisma.user.findFirst({ where: { clerkUserId: data.public_user_data?.user_id } });
    if (org && user) await prisma.tenantMembership.updateMany({ where: { tenantId: org.id, userId: user.id }, data: { status: 'SUSPENDED' } });
  }

  return NextResponse.json({ received: true });
}
`);

w('src/app/api/inngest/route.ts', `
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processAutomation, scheduleLeadCreatedAutomations } from '@/lib/inngest/functions';
export const { GET, POST, PUT } = serve({ client: inngest, functions: [processAutomation, scheduleLeadCreatedAutomations] });
`);

w('src/app/api/stripe/connect/authorize/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return NextResponse.redirect(new URL('/sign-in', req.url));
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { stripeConnect: true, branding: true } });
  if (!tenant) return NextResponse.redirect(new URL('/dashboard', req.url));
  let accountId: string;
  if (tenant.stripeConnect?.stripeAccountId && tenant.stripeConnect.onboardingStatus !== 'DEAUTHORIZED') {
    accountId = tenant.stripeConnect.stripeAccountId;
  } else {
    const acct = await stripe.accounts.create({ type: 'express', capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, business_profile: { name: tenant.branding?.companyName ?? tenant.name, product_description: 'Photo Booth Entertainment Services', mcc: '7929' }, metadata: { tenant_id: tenant.id } });
    accountId = acct.id;
    await prisma.stripeConnectAccount.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED', accountType: 'express', livemode: acct.livemode }, update: { stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED' } });
  }
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: APP + '/api/stripe/connect/authorize', return_url: APP + '/api/stripe/connect/callback?account_id=' + accountId + '&tenant_id=' + tenant.id, type: 'account_onboarding' });
  return NextResponse.redirect(link.url);
}
`);

w('src/app/api/stripe/connect/callback/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');
  const tenantId = searchParams.get('tenant_id');
  if (!accountId || !tenantId) return NextResponse.redirect(new URL('/settings/billing?error=invalid', APP));
  const record = await prisma.stripeConnectAccount.findFirst({ where: { stripeAccountId: accountId, tenantId } });
  if (!record) return NextResponse.redirect(new URL('/settings/billing?error=not_found', APP));
  const acct = await stripe.accounts.retrieve(accountId);
  const status = acct.charges_enabled && acct.payouts_enabled ? 'ACTIVE' : acct.charges_enabled ? 'RESTRICTED' : 'ONBOARDING_INITIATED';
  await prisma.stripeConnectAccount.update({ where: { id: record.id }, data: { onboardingStatus: status, chargesEnabled: acct.charges_enabled, payoutsEnabled: acct.payouts_enabled, detailsSubmitted: acct.details_submitted, email: acct.email ?? undefined, country: acct.country ?? undefined } });
  return NextResponse.redirect(new URL('/settings/billing?stripe_connect=' + (acct.charges_enabled ? 'success' : 'incomplete'), APP));
}
`);

w('src/app/api/stripe/webhooks/platform/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'No sig' }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return NextResponse.json({ error: 'Invalid sig' }, { status: 400 }); }

  const sub = (event.data.object as any);
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    await prisma.stripeSubscription.upsert({
      where: { stripeCustomerId: sub.customer },
      update: { stripeSubscriptionId: sub.id, status: sub.status.toUpperCase(), currentPeriodStart: new Date(sub.current_period_start * 1000), currentPeriodEnd: new Date(sub.current_period_end * 1000), cancelAtPeriodEnd: sub.cancel_at_period_end },
      create: { tenantId: 'unknown', stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id, plan: 'MONTHLY', status: sub.status.toUpperCase() },
    });
  }
  if (event.type === 'invoice.payment_failed') {
    const invoice = sub as Stripe.Invoice;
    const stripeRecord = await prisma.stripeSubscription.findFirst({ where: { stripeCustomerId: invoice.customer as string } });
    if (stripeRecord) await prisma.tenant.update({ where: { id: stripeRecord.tenantId }, data: { status: 'SUSPENDED' } });
  }
  return NextResponse.json({ received: true });
}
`);

w('src/app/api/contracts/[id]/sign/client/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { generateLockedContractPdf } from '@/lib/contracts/pdf-generator';
import { checkSigningRateLimit } from '@/lib/rate-limit';

const Schema = z.object({ clientToken: z.string().min(1).max(256), signatureDataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).max(500000), hasReadAndAgreed: z.literal(true) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkSigningRateLimit(ip).success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  const { clientToken, signatureDataUrl } = parsed.data;
  const contract = await prisma.contract.findFirst({ where: { id: params.id, clientToken }, include: { client: true, hostSignedBy: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found or invalid link.' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already executed.', pdfUrl: contract.pdfUrl }, { status: 409 });
  if (contract.status === 'VOIDED') return NextResponse.json({ error: 'Voided.' }, { status: 410 });
  if (contract.clientSignedAt) return NextResponse.json({ error: 'Already signed.' }, { status: 409 });
  if (contract.expiresAt && contract.expiresAt < new Date()) return NextResponse.json({ error: 'Link expired.' }, { status: 410 });
  const now = new Date();
  const newStatus = contract.hostSignedAt ? 'FULLY_EXECUTED' : 'CLIENT_SIGNED';
  await prisma.contract.update({ where: { id: contract.id }, data: { clientSignatureData: signatureDataUrl, clientSignedAt: now, clientIpAddress: ip, clientUserAgent: req.headers.get('user-agent') ?? undefined, status: newStatus } });
  await prisma.auditLog.create({ data: { tenantId: contract.tenantId, action: 'contract.client_signed', resourceType: 'Contract', resourceId: contract.id, ipAddress: ip, metadata: { newStatus } } });
  let pdfUrl: string | undefined;
  if (newStatus === 'FULLY_EXECUTED' && contract.hostSignedAt) {
    try {
      const b = contract.tenant.branding;
      const r = await generateLockedContractPdf({ contractId: contract.id, tenantId: contract.tenantId, title: contract.title, renderedContent: contract.renderedContent, clientFullName: contract.client.firstName + ' ' + contract.client.lastName, clientEmail: contract.client.email, clientSignatureDataUrl: signatureDataUrl, clientSignedAt: now, clientIpAddress: ip, hostFullName: contract.hostSignedBy?.name ?? 'Authorized Representative', hostEmail: contract.hostSignedBy?.email ?? '', hostSignatureDataUrl: contract.hostSignatureData!, hostSignedAt: contract.hostSignedAt, hostIpAddress: contract.hostIpAddress ?? 'unknown', branding: { companyName: b?.companyName ?? contract.tenant.name, primaryColor: b?.primaryColor ?? '#F97316', logoUrl: b?.logoUrl ?? undefined, invoiceFooterText: b?.invoiceFooterText ?? undefined } });
      pdfUrl = r.pdfUrl;
      await prisma.contract.update({ where: { id: contract.id }, data: { pdfUrl: r.pdfUrl, contentHash: r.contentHash, pdfLockedAt: now } });
    } catch (e) { console.error('[PDF_GEN]', e); }
  }
  return NextResponse.json({ success: true, status: newStatus, pdfUrl: pdfUrl ?? null });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, clientToken: token }, select: { id: true, title: true, status: true, renderedContent: true, clientSignedAt: true, hostSignedAt: true, expiresAt: true, pdfUrl: true, tenant: { select: { name: true, branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } } } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...c, clientHasSigned: !!c.clientSignedAt, hostHasSigned: !!c.hostSignedAt, isFullyExecuted: c.status === 'FULLY_EXECUTED', canSign: !c.clientSignedAt && c.status !== 'VOIDED' && c.status !== 'DRAFT' && (!c.expiresAt || c.expiresAt > new Date()), companyName: c.tenant.branding?.companyName ?? c.tenant.name });
}
`);

w('src/app/api/contracts/[id]/sign/host/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
import { generateLockedContractPdf } from '@/lib/contracts/pdf-generator';

const Schema = z.object({ signatureDataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).max(500000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 422 });
  const contract = await prisma.contract.findUnique({ where: { id: params.id }, include: { client: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId ?? '' } });
  if (!tenant || contract.tenantId !== tenant.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already executed', pdfUrl: contract.pdfUrl }, { status: 409 });
  if (contract.status === 'VOIDED' || contract.status === 'DRAFT') return NextResponse.json({ error: 'Cannot sign in state: ' + contract.status }, { status: 400 });
  if (contract.hostSignedAt) return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  const now = new Date();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const newStatus = contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED';
  const user = await prisma.user.findFirst({ where: { clerkUserId: userId } });
  await prisma.contract.update({ where: { id: contract.id }, data: { hostSignatureData: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, hostSignedByUserId: user?.id ?? undefined, status: newStatus } });
  await prisma.auditLog.create({ data: { tenantId: contract.tenantId, userId: user?.id, action: 'contract.host_signed', resourceType: 'Contract', resourceId: contract.id, metadata: { newStatus } } });
  let pdfUrl: string | undefined;
  if (newStatus === 'FULLY_EXECUTED' && contract.clientSignedAt && contract.clientSignatureData) {
    try {
      const b = contract.tenant.branding;
      const r = await generateLockedContractPdf({ contractId: contract.id, tenantId: contract.tenantId, title: contract.title, renderedContent: contract.renderedContent, clientFullName: contract.client.firstName + ' ' + contract.client.lastName, clientEmail: contract.client.email, clientSignatureDataUrl: contract.clientSignatureData, clientSignedAt: contract.clientSignedAt, clientIpAddress: contract.clientIpAddress ?? 'unknown', hostFullName: user?.name ?? 'Authorized Representative', hostEmail: user?.email ?? '', hostSignatureDataUrl: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, branding: { companyName: b?.companyName ?? contract.tenant.name, primaryColor: b?.primaryColor ?? '#F97316', logoUrl: b?.logoUrl ?? undefined, invoiceFooterText: b?.invoiceFooterText ?? undefined } });
      pdfUrl = r.pdfUrl;
      await prisma.contract.update({ where: { id: contract.id }, data: { pdfUrl: r.pdfUrl, contentHash: r.contentHash, pdfLockedAt: now } });
    } catch (e) { console.error('[HOST_PDF_GEN]', e); }
  }
  return NextResponse.json({ success: true, status: newStatus, pdfUrl: pdfUrl ?? null });
}
`);

w('src/app/api/contracts/[id]/send/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
import { sendContractLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const contract = await prisma.contract.findUnique({ where: { id: params.id }, include: { client: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId ?? '' } });
  if (!tenant || contract.tenantId !== tenant.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { expiryDays = 14 } = await req.json().catch(() => ({}));
  const expiresAt = new Date(Date.now() + expiryDays * 86400000);
  await prisma.contract.update({ where: { id: contract.id }, data: { status: 'SENT_TO_CLIENT', expiresAt } });
  const portalUrl = APP + '/portal/' + contract.event?.toString();
  await sendContractLink({ to: contract.client.email, firstName: contract.client.firstName, companyName: contract.tenant.branding?.companyName ?? tenant.name, contractTitle: contract.title, portalUrl, expiresAt });
  return NextResponse.json({ success: true, expiresAt });
}
`);

w('src/app/api/portal/[portalToken]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { format } from 'date-fns';

export async function GET(_req: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({ where: { portalToken: params.portalToken }, include: { client: { select: { firstName: true, lastName: true, email: true, phone: true } }, tenant: { select: { name: true, status: true, branding: { select: { companyName: true, logoUrl: true, primaryColor: true, secondaryColor: true, replyToEmail: true, supportPhone: true, websiteUrl: true } } } }, invoices: { orderBy: { createdAt: 'desc' }, take: 1, include: { lineItems: { orderBy: { sortOrder: 'asc' } } } }, contracts: { orderBy: { createdAt: 'desc' }, take: 1 }, gallery: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = event.invoices[0] ?? null;
  const con = event.contracts[0] ?? null;
  const b = event.tenant.branding;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  return NextResponse.json({
    booking: { title: event.title, status: event.status, eventDate: format(event.eventDate, 'EEEE, MMMM d, yyyy'), startTime: event.startTime ? format(event.startTime, 'h:mm a') : null, endTime: event.endTime ? format(event.endTime, 'h:mm a') : null, venueName: event.venueName, venueAddress: [event.venueAddress, event.venueCity, event.venueState].filter(Boolean).join(', ') || null, packageName: event.packageName, guestCount: event.guestCount },
    client: { firstName: event.client.firstName, displayName: event.client.firstName + ' ' + event.client.lastName },
    branding: { companyName: b?.companyName ?? event.tenant.name, logoUrl: b?.logoUrl ?? null, primaryColor: b?.primaryColor ?? '#F97316', contactEmail: b?.replyToEmail ?? null, contactPhone: b?.supportPhone ?? null },
    invoice: inv ? { invoiceNumber: inv.invoiceNumber, status: inv.status, totalFormatted: fmt(inv.totalCents), amountPaidFormatted: fmt(inv.amountPaidCents), balanceDueFormatted: fmt(inv.balanceDueCents), balanceDueCents: inv.balanceDueCents, isPaid: inv.status === 'PAID', dueDate: inv.dueDate ? format(inv.dueDate, 'MMMM d, yyyy') : null, canPay: inv.balanceDueCents > 0 && event.tenant.status !== 'SUSPENDED', lineItems: inv.lineItems, retainer: inv.retainerAmountCents ? { amountFormatted: fmt(inv.retainerAmountCents), isPaid: !!inv.retainerPaidAt } : null } : null,
    contract: con ? { title: con.title, status: con.status, renderedContent: con.status !== 'DRAFT' ? con.renderedContent : null, clientToken: con.clientToken, contractId: con.id, clientHasSigned: !!con.clientSignedAt, hostHasSigned: !!con.hostSignedAt, isFullyExecuted: con.status === 'FULLY_EXECUTED', canSign: !con.clientSignedAt && con.status !== 'VOIDED' && con.status !== 'DRAFT' && (!con.expiresAt || con.expiresAt > new Date()), pdfUrl: con.status === 'FULLY_EXECUTED' ? con.pdfUrl : null } : null,
    gallery: event.gallery ? { title: event.gallery.title, approvalStatus: event.gallery.approvalStatus, isPublished: event.gallery.isPublished } : null,
    meta: { tabs: { booking: true, invoice: !!inv, contract: !!con && con.status !== 'DRAFT', gallery: !!event.gallery?.isPublished } },
  }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
`);

w('src/app/api/public/[tenantSlug]/leads/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma/client';
import { checkLeadRateLimit } from '@/lib/rate-limit';
import { inngest } from '@/lib/inngest/client';

const Schema = z.object({ firstName: z.string().min(1).max(100).trim(), lastName: z.string().min(1).max(100).trim(), email: z.string().email().toLowerCase().trim(), phone: z.string().max(30).optional().nullable(), eventDate: z.string().optional().nullable().transform(v => v ? new Date(v) : null), eventType: z.string().max(100).optional().nullable(), venueName: z.string().max(200).optional().nullable(), guestCount: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().int().min(1).max(10000)).optional().nullable(), packageInterest: z.string().max(100).optional().nullable(), message: z.string().max(2000).optional().nullable(), hearAboutUs: z.string().max(200).optional().nullable(), referrerUrl: z.string().url().optional().nullable(), utmSource: z.string().max(100).optional().nullable(), utmMedium: z.string().max(100).optional().nullable(), utmCampaign: z.string().max(100).optional().nullable() });
const cors = () => ({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });

export async function OPTIONS() { return new Response(null, { status: 204, headers: cors() }); }

export async function POST(req: NextRequest, { params }: { params: { tenantSlug: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkLeadRateLimit(ip).success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: cors() });
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'SUSPENDED') return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
  let apiKeyId: string | null = null; let source: 'iframe' | 'api' = 'iframe';
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer pb_')) {
    const h = createHash('sha256').update(auth.slice(7)).digest('hex');
    const k = await prisma.tenantApiKey.findFirst({ where: { keyHash: h, tenantId: tenant.id, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!k) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors() });
    apiKeyId = k.id; source = 'api';
    prisma.tenantApiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(console.error);
  }
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: cors() }); }
  const p = Schema.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Validation failed', details: p.error.flatten().fieldErrors }, { status: 422, headers: cors() });
  const d = p.data;
  const recent = await prisma.leadSubmission.findFirst({ where: { tenantId: tenant.id, email: d.email, isSpam: false, createdAt: { gte: new Date(Date.now() - 86400000) } }, select: { id: true } });
  if (recent) return NextResponse.json({ success: true, message: 'Inquiry received.' }, { status: 200, headers: cors() });
  const lead = await prisma.leadSubmission.create({ data: { tenantId: tenant.id, apiKeyId, firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone ?? null, eventDate: d.eventDate ?? null, eventType: d.eventType ?? null, venueName: d.venueName ?? null, guestCount: d.guestCount ?? null, packageInterest: d.packageInterest ?? null, message: d.message ?? null, hearAboutUs: d.hearAboutUs ?? null, source, referrerUrl: d.referrerUrl ?? null, utmSource: d.utmSource ?? null, utmMedium: d.utmMedium ?? null, utmCampaign: d.utmCampaign ?? null, ipAddress: ip, userAgent: req.headers.get('user-agent') ?? null } });
  inngest.send({ name: 'lead/created', data: { tenantId: tenant.id, leadId: lead.id } }).catch(console.error);
  return NextResponse.json({ success: true, message: 'Inquiry received. We\'ll be in touch shortly.' }, { status: 201, headers: cors() });
}

export async function generateApiKey(tenantId: string, name: string) {
  const raw = 'pb_live_' + randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const k = await prisma.tenantApiKey.create({ data: { tenantId, name, keyHash: hash, prefix: raw.slice(0, 15) } });
  return { ...k, rawKey: raw };
}
`);

w('src/app/api/super-admin/metrics/route.ts', `
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { clerkUserId: userId } });
  if (user?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [total, active, trial, suspended, cancelled, recentHosts] = await Promise.all([
    prisma.tenant.count(), prisma.tenant.count({ where: { status: 'ACTIVE' } }), prisma.tenant.count({ where: { status: 'TRIAL' } }), prisma.tenant.count({ where: { status: 'SUSPENDED' } }), prisma.tenant.count({ where: { status: 'CANCELLED' } }),
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } } } }),
  ]);
  return NextResponse.json({ overview: { total, active, trial, suspended, cancelled }, hosts: recentHosts });
}

export async function PATCH(req: Request) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { clerkUserId: userId } });
  if (user?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const tenantId = url.pathname.split('/').pop();
  const { status } = await (req as any).json();
  if (!tenantId || !['ACTIVE', 'SUSPENDED'].includes(status)) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  await prisma.tenant.update({ where: { id: tenantId }, data: { status } });
  return NextResponse.json({ success: true });
}
`);

// ─── 6. EMBED ROUTE ────────────────────────────────────────────────────────────

w('src/app/embed/[tenantSlug]/inquiry/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

function dk(hex: string, pct: number) {
  const n = parseInt(hex.replace('#',''), 16), a = Math.round(2.55 * pct);
  return '#' + ((1<<24) + (Math.max(0,(n>>16)-a)<<16) + (Math.max(0,((n>>8)&0xff)-a)<<8) + Math.max(0,(n&0xff)-a)).toString(16).slice(1);
}

export async function GET(req: NextRequest, { params }: { params: { tenantSlug: string } }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } });
  if (!tenant || tenant.status === 'SUSPENDED') return new NextResponse('Not found', { status: 404 });
  const co = tenant.branding?.companyName ?? tenant.name;
  const pc = tenant.branding?.primaryColor ?? '#F97316';
  const pd = dk(pc, 15);
  const api = '/api/public/' + params.tenantSlug + '/leads';

  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Book with ' + co + '</title><style>*{box-sizing:border-box;margin:0;padding:0}:root{--p:' + pc + ';--pd:' + pd + '}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111827;font-size:15px;padding:24px 20px 32px}.hdr{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--p)}.hdr img{height:40px;object-fit:contain}.hdr h1{font-size:17px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.full{grid-column:1/-1}label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:5px}.req{color:var(--p)}input,select,textarea{width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;color:#111827;background:#fff;outline:none;font-family:inherit;transition:border-color .15s}input:focus,select:focus,textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px ' + pc + '22}textarea{resize:vertical;min-height:80px}.honey{display:none!important}.btn{margin-top:20px;width:100%;padding:13px;background:var(--p);color:#fff;font-size:15px;font-weight:700;border:none;border-radius:8px;cursor:pointer;transition:background .15s;font-family:inherit}.btn:hover{background:var(--pd)}.btn:disabled{opacity:.65;cursor:not-allowed}.err{color:#ef4444;font-size:12px;margin-top:4px}.errbox{padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;margin-top:14px;display:none}.succ{display:none;text-align:center;padding:40px 20px}.succ-icon{width:60px;height:60px;background:var(--p);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}.succ h2{font-size:20px;margin-bottom:8px}.succ p{color:#6b7280;font-size:14px}@media(max-width:480px){.grid{grid-template-columns:1fr}}</style></head><body><div class="hdr">' + (tenant.branding?.logoUrl ? '<img src="' + (tenant.branding?.logoUrl ?? '') + '" alt="' + co + '"/>' : '') + '<h1>Book with ' + co + '</h1></div><form id="f" novalidate><input class="honey" type="text" name="website" tabindex="-1" autocomplete="off"/><div class="grid"><div><label>First Name <span class="req">*</span></label><input type="text" name="firstName" autocomplete="given-name" required/></div><div><label>Last Name <span class="req">*</span></label><input type="text" name="lastName" autocomplete="family-name" required/></div><div><label>Email <span class="req">*</span></label><input type="email" name="email" autocomplete="email" required/></div><div><label>Phone</label><input type="tel" name="phone" autocomplete="tel"/></div><div><label>Event Date <span class="req">*</span></label><input type="date" name="eventDate" required/></div><div><label>Event Type</label><select name="eventType"><option value="">— Select —</option><option>Wedding</option><option>Corporate Event</option><option>Birthday Party</option><option>Quinceanera / Sweet 16</option><option>Graduation</option><option>Holiday Party</option><option>Other</option></select></div><div><label>Est. Guest Count</label><input type="number" name="guestCount" min="1" max="5000" placeholder="150"/></div><div class="full"><label>Tell us about your event</label><textarea name="message" placeholder="Venue, vibe, special requests..."></textarea></div></div><div class="errbox" id="eb"></div><button type="submit" class="btn" id="sb">Send My Inquiry</button></form><div class="succ" id="succ"><div class="succ-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div><h2>We received your inquiry!</h2><p>We\'ll be in touch within 1-2 business days.</p></div><script>(function(){function sh(){window.parent.postMessage({type:\'pbcrm:resize\',height:document.body.scrollHeight},\'*\')}sh();new ResizeObserver(sh).observe(document.body);document.getElementById(\'f\').addEventListener(\'submit\',async function(e){e.preventDefault();var eb=document.getElementById(\'eb\'),sb=document.getElementById(\'sb\');eb.style.display=\'none\';if(this.elements[\'website\'].value)return;var req=[\'firstName\',\'lastName\',\'email\',\'eventDate\'],ok=true;req.forEach(function(n){var el=this.elements[n];el.style.borderColor=el.value.trim()?\'\':\\'#ef4444\\';if(!el.value.trim())ok=false;},this);if(!ok){eb.textContent=\'Please fill in all required fields.\';eb.style.display=\'block\';sh();return;}sb.disabled=true;sb.textContent=\'Sending\u2026\';var data={};new FormData(this).forEach(function(v,k){if(k!==\'website\')data[k]=v;});data.referrerUrl=document.referrer||window.location.href;try{var res=await fetch(\'' + api + '\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify(data)});var json=await res.json();if(!res.ok)throw new Error(json.error||\'Submission failed\');document.getElementById(\'f\').style.display=\'none\';document.getElementById(\'succ\').style.display=\'block\';sh();window.parent.postMessage({type:\'pbcrm:lead_captured\'},\'*\');}catch(err){eb.textContent=err.message||\'Something went wrong. Please try again.\';eb.style.display=\'block\';sb.disabled=false;sb.textContent=\'Send My Inquiry\';sh();}});})();</script></body></html>';

  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'ALLOWALL', 'Content-Security-Policy': 'frame-ancestors *', 'Cache-Control': 'public, max-age=300' } });
}
`);

// ─── 7. UI COMPONENTS ─────────────────────────────────────────────────────────

w('src/components/ui/button.tsx', `
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
const variants: Record<string, string> = {
  default: 'bg-brand text-white hover:bg-brand-dark',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
};
const sizes: Record<string, string> = { default: 'h-10 px-4 py-2', sm: 'h-8 px-3 text-sm', lg: 'h-11 px-8', icon: 'h-10 w-10' };
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: keyof typeof variants; size?: keyof typeof sizes; }
const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'default', size = 'default', ...props }, ref) => (
  <button ref={ref} className={cn('inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none', variants[variant], sizes[size], className)} {...props} />
));
Button.displayName = 'Button';
export { Button };
`);

w('src/components/ui/card.tsx', `
import { cn } from '@/lib/utils';
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)} {...p} />; }
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...p} />; }
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...p} />; }
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('p-6 pt-0', className)} {...p} />; }
`);

w('src/components/ui/input.tsx', `
import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';
const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:opacity-50', className)} {...props} />
));
Input.displayName = 'Input';
export { Input };
`);

w('src/components/ui/badge.tsx', `
import { cn } from '@/lib/utils';
const variants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  brand: 'bg-brand-surface text-brand-dark',
};
export function Badge({ className, variant = 'default', ...p }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)} {...p} />;
}
`);

w('src/components/ui/select.tsx', `
import { cn } from '@/lib/utils';
import { SelectHTMLAttributes, forwardRef } from 'react';
const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn('flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50', className)} {...props} />
));
Select.displayName = 'Select';
export { Select };
`);

w('src/components/ui/textarea.tsx', `
import { cn } from '@/lib/utils';
import { TextareaHTMLAttributes, forwardRef } from 'react';
const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn('flex min-h-[80px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 resize-none', className)} {...props} />
));
Textarea.displayName = 'Textarea';
export { Textarea };
`);

w('src/components/ui/modal.tsx', `
'use client';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { X } from 'lucide-react';
export function Modal({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string }) {
  useEffect(() => { if (open) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cn('relative z-10 bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto', className)}>
        {title && <div className="flex items-center justify-between px-6 py-4 border-b"><h2 className="text-lg font-semibold">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button></div>}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
`);

// ─── 8. LAYOUT COMPONENTS ─────────────────────────────────────────────────────

w('src/components/layout/Sidebar.tsx', `
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, ChevronRight } from 'lucide-react';
import { useClerk, useOrganization } from '@clerk/nextjs';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/gallery', label: 'Gallery', icon: Camera },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const { signOut } = useClerk();
  const { organization } = useOrganization();

  return (
    <aside className="w-64 h-screen bg-canvas flex flex-col fixed left-0 top-0 z-40">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Photo Booth CRM</p>
            <p className="text-sidebar-text text-xs truncate max-w-[140px]">{organization?.name ?? 'Loading...'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors group', active ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white')}>
              <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-brand' : 'text-sidebar-text group-hover:text-brand')} />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto text-brand" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button onClick={() => signOut()} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white w-full transition-colors">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
`);

w('src/components/layout/TopBar.tsx', `
import { UserButton } from '@clerk/nextjs';
import { Bell } from 'lucide-react';
export function TopBar({ title }: { title: string }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 fixed right-0 left-64 top-0 z-30">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        <button className="relative text-gray-400 hover:text-gray-600">
          <Bell className="w-5 h-5" />
        </button>
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
`);

w('src/components/contracts/SignatureCanvas.tsx', `
'use client';
import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props { onCapture: (dataUrl: string) => void; className?: string; }

export function SignatureCanvas({ onCapture, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const src = 'touches' in e ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); setDrawing(true); setHasDrawn(true);
    const pos = getPos(e); last.current = pos;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return; e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    last.current = pos;
  }

  function stop() {
    if (!drawing) return; setDrawing(false);
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    onCapture(dataUrl);
  }

  function clear() {
    const c = canvasRef.current!; const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height); setHasDrawn(false); onCapture('');
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 h-32">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg touch-none" onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
        {!hasDrawn && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-gray-400 text-sm">Draw your signature here</p></div>}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasDrawn}>Clear</Button>
    </div>
  );
}
`);

// ─── 9. APP SHELL ─────────────────────────────────────────────────────────────

w('src/app/globals.css', `@tailwind base;
@tailwind components;
@tailwind utilities;
:root { font-feature-settings: "cv11", "ss01"; }
body { @apply antialiased; }
`);

w('src/app/layout.tsx', `
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = { title: 'Photo Booth CRM', description: 'Complete CRM for photo booth operators' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
`);

w('src/app/(auth)/sign-in/[[...sign-in]]/page.tsx', `
import { SignIn } from '@clerk/nextjs';
export default function Page() {
  return <div className="min-h-screen flex items-center justify-center bg-gray-50"><SignIn /></div>;
}
`);

w('src/app/(auth)/sign-up/[[...sign-up]]/page.tsx', `
import { SignUp } from '@clerk/nextjs';
export default function Page() {
  return <div className="min-h-screen flex items-center justify-center bg-gray-50"><SignUp /></div>;
}
`);

w('src/app/onboarding/page.tsx', `
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganizationList } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera } from 'lucide-react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { createOrganization, setActive } = useOrganizationList();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim() || !createOrganization) return;
    setLoading(true);
    try {
      const org = await createOrganization({ name });
      await setActive?.({ organization: org.id });
      router.push('/dashboard');
    } catch (e) { console.error(e); setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Welcome to Photo Booth CRM</h1>
            <p className="text-sm text-gray-500">Let's set up your company</p>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pixel Perfect Photo Booths" onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating...' : 'Create My Company \u2192'}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-4">You can invite team members and customize branding in settings.</p>
      </div>
    </div>
  );
}
`);

w('src/app/(tenant)/layout.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = auth();
  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/onboarding');
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pl-64 pt-16">{children}</main>
    </div>
  );
}
`);

// ─── 10. DASHBOARD & EVENTS ───────────────────────────────────────────────────

w('src/app/(tenant)/dashboard/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Users, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const statusColor: Record<string, any> = { LEAD: 'info', QUOTED: 'warning', BOOKED: 'brand', IN_PROGRESS: 'brand', COMPLETED: 'success', CANCELLED: 'danger' };

export default async function DashboardPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { branding: true } });
  if (!tenant) redirect('/onboarding');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [upcomingEvents, totalClients, newLeads, monthlyRevenue] = await Promise.all([
    prisma.event.findMany({ where: { tenantId: tenant.id, eventDate: { gte: now }, status: { not: 'CANCELLED' } }, include: { client: true }, orderBy: { eventDate: 'asc' }, take: 8 }),
    prisma.client.count({ where: { tenantId: tenant.id } }),
    prisma.leadSubmission.count({ where: { tenantId: tenant.id, createdAt: { gte: monthStart } } }),
    prisma.payment.aggregate({ where: { tenantId: tenant.id, paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
  ]);

  const mrv = monthlyRevenue._sum.amountCents ?? 0;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  const stats = [
    { label: 'Upcoming Events', value: upcomingEvents.length, icon: Calendar, color: 'text-brand' },
    { label: 'Total Clients', value: totalClients, icon: Users, color: 'text-blue-500' },
    { label: 'New Leads (Month)', value: newLeads, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Revenue (Month)', value: fmt(mrv), icon: DollarSign, color: 'text-green-500' },
  ];

  return (
    <>
      <TopBar title={'Dashboard'} />
      <div className="p-8 space-y-8">
        {tenant.status === 'TRIAL' && tenant.trialEndsAt && (
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-brand-dark">Free Trial Active</p>
              <p className="text-sm text-gray-600">Trial ends {format(tenant.trialEndsAt, 'MMMM d, yyyy')} \u2022 Connect Stripe to start accepting payments</p>
            </div>
            <Link href="/settings/billing"><Button size="sm">Upgrade Plan</Button></Link>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map(s => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">{s.label}</p>
                  <s.icon className={'w-5 h-5 ' + s.color} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Events</CardTitle>
              <Link href="/events/new"><Button size="sm"><Plus className="w-4 h-4 mr-1"/>New Event</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No upcoming events. <Link href="/events/new" className="text-brand hover:underline">Create one</Link></p>
              </div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {upcomingEvents.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4"><p className="font-medium text-gray-900">{ev.title}</p><p className="text-sm text-gray-500">{ev.venueName ?? 'Venue TBD'}</p></td>
                      <td className="px-6 py-4 text-sm text-gray-700">{ev.client.firstName} {ev.client.lastName}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{format(ev.eventDate, 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4"><Badge variant={statusColor[ev.status] ?? 'default'}>{ev.status}</Badge></td>
                      <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/events/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string, any> = { LEAD: 'info', QUOTED: 'warning', BOOKED: 'brand', IN_PROGRESS: 'brand', COMPLETED: 'success', CANCELLED: 'danger' };

export default async function EventsPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const events = await prisma.event.findMany({ where: { tenantId: tenant.id }, include: { client: true }, orderBy: { eventDate: 'desc' }, take: 100 });
  return (
    <>
      <TopBar title="Events" />
      <div className="p-8">
        <div className="flex justify-end mb-6">
          <Link href="/events/new"><Button><Plus className="w-4 h-4 mr-2"/>New Event</Button></Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p className="text-lg font-medium mb-2">No events yet</p>
                <p className="text-sm mb-4">Create your first event or wait for inquiries from your website</p>
                <Link href="/events/new"><Button>Create First Event</Button></Link>
              </div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Package</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4"><p className="font-semibold text-gray-900">{ev.title}</p><p className="text-xs text-gray-400">{ev.venueName ?? ''}</p></td>
                      <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{format(ev.eventDate, 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{ev.packageName ?? '—'}</td>
                      <td className="px-6 py-4"><Badge variant={SC[ev.status] ?? 'default'}>{ev.status.replace('_',' ')}</Badge></td>
                      <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/events/new/page.tsx', `
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', title: '', eventDate: '', startTime: '', endTime: '', venueName: '', venueAddress: '', venueCity: '', venueState: '', packageName: '', guestCount: '', internalNotes: '', status: 'LEAD' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) router.push('/events/' + data.id);
      else alert(data.error ?? 'Failed to create event');
    } finally { setLoading(false); }
  }

  const field = (k: string, label: string, type = 'text', placeholder = '', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <Input type={type} value={form[k as keyof typeof form]} onChange={e => set(k, e.target.value)} placeholder={placeholder} required={required} />
    </div>
  );

  return (
    <>
      <TopBar title="New Event" />
      <div className="p-8 max-w-3xl">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Client Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {field('firstName', 'First Name', 'text', 'Jane', true)}
              {field('lastName', 'Last Name', 'text', 'Smith', true)}
              {field('email', 'Email', 'email', 'jane@example.com', true)}
              {field('phone', 'Phone', 'tel', '(555) 123-4567')}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2">{field('title', 'Event Name', 'text', 'Smith Wedding', true)}</div>
              {field('eventDate', 'Event Date', 'date', '', true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="LEAD">Lead</option><option value="QUOTED">Quoted</option><option value="BOOKED">Booked</option>
                </Select>
              </div>
              {field('startTime', 'Start Time', 'time')}
              {field('endTime', 'End Time', 'time')}
              {field('venueName', 'Venue Name', 'text', 'The Grand Ballroom')}
              {field('venueAddress', 'Venue Address')}
              {field('venueCity', 'City')}
              {field('venueState', 'State', 'text', 'TX')}
              {field('packageName', 'Package', 'text', 'Deluxe 4-Hour Package')}
              {field('guestCount', 'Guest Count', 'number')}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                <Textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} placeholder="Notes visible only to your team..." />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Event'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}
`);

w('src/app/api/events/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  const body = await req.json();
  const { firstName, lastName, email, phone, title, eventDate, startTime, endTime, venueName, venueAddress, venueCity, venueState, packageName, guestCount, internalNotes, status } = body;
  if (!firstName || !lastName || !email || !title || !eventDate) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const client = await prisma.client.upsert({ where: { tenantId_email: { tenantId: tenant.id, email } }, update: { firstName, lastName, phone: phone || null }, create: { tenantId: tenant.id, firstName, lastName, email, phone: phone || null } });
  const event = await prisma.event.create({ data: { tenantId: tenant.id, clientId: client.id, title, status: status || 'LEAD', eventDate: new Date(eventDate), startTime: startTime ? new Date(eventDate + 'T' + startTime) : null, endTime: endTime ? new Date(eventDate + 'T' + endTime) : null, venueName: venueName || null, venueAddress: venueAddress || null, venueCity: venueCity || null, venueState: venueState || null, packageName: packageName || null, guestCount: guestCount ? parseInt(guestCount) : null, internalNotes: internalNotes || null } });
  return NextResponse.json(event, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: tenant.id }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
`);

// ─── 11. EVENT DETAIL ─────────────────────────────────────────────────────────

w('src/app/(tenant)/events/[id]/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Package, ArrowLeft, ExternalLink, FileText, Receipt } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string, any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };
const IC: Record<string, any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const CC: Record<string, any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: tenant.id }, include: { client: true, invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }, contracts: { orderBy: { createdAt: 'desc' } } } });
  if (!event) notFound();

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL + '/portal/' + event.portalToken;

  return (
    <>
      <TopBar title={event.title} />
      <div className="p-8 space-y-6 max-w-5xl">
        <Link href="/events" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Back to Events</Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold">{event.title}</h2>
              <Badge variant={SC[event.status]}>{event.status.replace('_',' ')}</Badge>
            </div>
            <p className="text-gray-500">{event.client.firstName} {event.client.lastName} \u2022 {event.client.email}</p>
          </div>
          <div className="flex gap-2">
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>Client Portal</Button></a>
            <Link href={'/invoices/new?eventId=' + event.id}><Button size="sm"><Receipt className="w-4 h-4 mr-1"/>Create Invoice</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader><CardTitle>Event Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-4">
              <div className="flex items-start gap-2"><Calendar className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="text-xs text-gray-500">Event Date</p><p className="font-medium">{format(event.eventDate,'EEEE, MMMM d, yyyy')}</p>{event.startTime && <p className="text-sm text-gray-600">{format(event.startTime,'h:mm a')}{event.endTime ? ' \u2013 ' + format(event.endTime,'h:mm a') : ''}</p>}</div></div>
              {event.venueName && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="text-xs text-gray-500">Venue</p><p className="font-medium">{event.venueName}</p>{event.venueCity && <p className="text-sm text-gray-600">{[event.venueAddress,event.venueCity,event.venueState].filter(Boolean).join(', ')}</p>}</div></div>}
              {event.guestCount && <div className="flex items-start gap-2"><Users className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="text-xs text-gray-500">Guest Count</p><p className="font-medium">{event.guestCount}</p></div></div>}
              {event.packageName && <div className="flex items-start gap-2"><Package className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0"/><div><p className="text-xs text-gray-500">Package</p><p className="font-medium">{event.packageName}</p></div></div>}
              {event.internalNotes && <div className="col-span-2"><p className="text-xs text-gray-500 mb-1">Internal Notes</p><p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{event.internalNotes}</p></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold">{event.client.firstName} {event.client.lastName}</p>
              <p className="text-gray-600">{event.client.email}</p>
              {event.client.phone && <p className="text-gray-600">{event.client.phone}</p>}
              <div className="pt-2 border-t"><p className="text-xs text-gray-400 mb-1">Client Portal</p><a href={portalUrl} target="_blank" className="text-brand hover:underline text-xs break-all">{portalUrl}</a></div>
            </CardContent>
          </Card>
        </div>

        {event.invoices.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Invoices</CardTitle><Link href={'/invoices/new?eventId=' + event.id}><Button variant="outline" size="sm">Add Invoice</Button></Link></div></CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance Due</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {event.invoices.map(inv => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="px-6 py-3 text-sm font-medium">{inv.invoiceNumber}</td>
                      <td className="px-6 py-3 text-sm">{fmt(inv.totalCents)}</td>
                      <td className="px-6 py-3 text-sm">{fmt(inv.balanceDueCents)}</td>
                      <td className="px-6 py-3"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td>
                      <td className="px-6 py-3 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm">View</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {event.contracts.length > 0 && (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Contracts</CardTitle></div></CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {event.contracts.map(c => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-6 py-3 text-sm font-medium"><FileText className="inline w-4 h-4 mr-2 text-gray-400"/>{c.title}</td>
                      <td className="px-6 py-3"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td>
                      <td className="px-6 py-3 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm">View</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
`);

// ─── 12. CLIENTS ──────────────────────────────────────────────────────────────

w('src/app/(tenant)/clients/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ArrowRight, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';

export default async function ClientsPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const clients = await prisma.client.findMany({ where: { tenantId: tenant.id }, include: { _count: { select: { events: true, invoices: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Clients" />
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
          <Link href="/events/new"><Button>Add Client + Event</Button></Link>
        </div>
        <Card>
          <CardContent className="p-0">
            {clients.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><Users className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Clients appear here when you create events or receive inquiries.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Added</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-semibold text-gray-900">{c.firstName} {c.lastName}</p>{c.company && <p className="text-xs text-gray-400">{c.company}</p>}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1 text-gray-600"><Mail className="w-3 h-3"/>{c.email}</div>{c.phone && <div className="flex items-center gap-1 text-gray-500 mt-1"><Phone className="w-3 h-3"/>{c.phone}</div>}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{c._count.events} event{c._count.events !== 1 ? 's' : ''}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 text-right"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// ─── 13. INVOICES ─────────────────────────────────────────────────────────────

w('src/app/(tenant)/invoices/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string, any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export default async function InvoicesPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Invoices" />
      <div className="p-8">
        <div className="flex justify-end mb-6"><Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-2"/>New Invoice</Button></Link></div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {invoices.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No invoices yet. <Link href="/invoices/new" className="text-brand hover:underline">Create one</Link></td></tr>}
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{inv.invoiceNumber}</p>{inv.event && <p className="text-xs text-gray-400">{inv.event.title}</p>}</td>
                    <td className="px-6 py-4 text-sm">{inv.client.firstName} {inv.client.lastName}</td>
                    <td className="px-6 py-4 text-sm font-medium">{fmt(inv.totalCents)}</td>
                    <td className="px-6 py-4 text-sm">{fmt(inv.balanceDueCents)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{inv.dueDate ? format(inv.dueDate,'MMM d') : '—'}</td>
                    <td className="px-6 py-4"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td>
                    <td className="px-6 py-4 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/invoices/new/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

type LineItem = { description: string; quantity: number; unitCents: number; totalCents: number; taxable: boolean };

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const [loading, setLoading] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [retainerPct, setRetainerPct] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitCents: 0, totalCents: 0, taxable: true }]);
  const [eventData, setEventData] = useState<any>(null);

  useEffect(() => { if (eventId) fetch('/api/events/' + eventId).then(r => r.json()).then(d => { setEventData(d); setClientEmail(d.client?.email ?? ''); }); }, [eventId]);

  const updateItem = (i: number, k: string, v: any) => setItems(items.map((it, idx) => { if (idx !== i) return it; const upd = { ...it, [k]: v }; if (k === 'quantity' || k === 'unitCents') upd.totalCents = upd.quantity * upd.unitCents; return upd; }));
  const addItem = () => setItems([...items, { description: '', quantity: 1, unitCents: 0, totalCents: 0, taxable: true }]);
  const removeItem = (i: number) => setItems(items.filter((_,idx) => idx !== i));

  const subtotal = items.reduce((s,it) => s + it.totalCents, 0);
  const taxable = items.filter(i => i.taxable).reduce((s,it) => s + it.totalCents, 0);
  const taxRateBps = Math.round(parseFloat(taxRate || '0') * 100);
  const taxAmt = Math.round(taxable * taxRateBps / 10000);
  const total = subtotal + taxAmt;
  const retainerAmt = retainerPct ? Math.round(total * parseFloat(retainerPct) / 100) : 0;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientEmail, eventId, dueDate, retainerPercent: retainerPct ? parseInt(retainerPct) : null, retainerAmountCents: retainerAmt || null, taxRateBps, taxAmountCents: taxAmt, subtotalCents: subtotal, totalCents: total, balanceDueCents: total, notes, lineItems: items }) });
      const data = await res.json();
      if (res.ok) router.push('/invoices/' + data.id);
      else alert(data.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Invoice" />
      <div className="p-8 max-w-3xl space-y-6">
        {eventData && <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 text-sm"><strong>Event:</strong> {eventData.title} on {new Date(eventData.eventDate).toLocaleDateString()} for {eventData.client?.firstName} {eventData.client?.lastName}</div>}
        <Card>
          <CardHeader><CardTitle>Client &amp; Terms</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Client Email *</label><Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label><Input type="number" step="0.1" value={taxRate} onChange={e => setTaxRate(e.target.value)} placeholder="0"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Retainer Required (%)</label><Input type="number" value={retainerPct} onChange={e => setRetainerPct(e.target.value)} placeholder="25"/></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment instructions, terms..."/></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Line</Button></div></CardHeader>
          <CardContent className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><Input value={it.description} onChange={e => updateItem(i,'description',e.target.value)} placeholder="Photo booth package"/></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Qty</label><Input type="number" value={it.quantity} onChange={e => updateItem(i,'quantity',parseFloat(e.target.value)||0)} min="0"/></div>
                <div className="col-span-3"><label className="block text-xs font-medium text-gray-600 mb-1">Unit Price ($)</label><Input type="number" value={(it.unitCents/100).toFixed(2)} onChange={e => updateItem(i,'unitCents',Math.round(parseFloat(e.target.value||'0')*100))} min="0" step="0.01"/></div>
                <div className="col-span-1 text-sm font-medium text-right pt-6">{fmt(it.totalCents)}</div>
                <div className="col-span-1 pt-6"><Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></Button></div>
              </div>
            ))}
            <div className="border-t pt-3 mt-4 space-y-1 text-sm text-right">
              <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
              {taxRateBps > 0 && <p className="text-gray-500">Tax ({(taxRateBps/100).toFixed(1)}%): {fmt(taxAmt)}</p>}
              <p className="text-lg font-bold text-gray-900">Total: {fmt(total)}</p>
              {retainerAmt > 0 && <p className="text-brand font-semibold">Retainer due: {fmt(retainerAmt)} ({retainerPct}%)</p>}
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Invoice'}</Button>
        </div>
      </div>
    </>
  );
}
`);

w('src/app/api/invoices/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const { clientEmail, eventId, dueDate, retainerPercent, retainerAmountCents, taxRateBps, taxAmountCents, subtotalCents, totalCents, balanceDueCents, notes, lineItems } = body;
  const client = await prisma.client.findFirst({ where: { tenantId: tenant.id, email: clientEmail } });
  if (!client) return NextResponse.json({ error: 'Client not found for email: ' + clientEmail }, { status: 404 });
  const count = await prisma.invoice.count({ where: { tenantId: tenant.id } });
  const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0');
  const invoice = await prisma.invoice.create({ data: { tenantId: tenant.id, clientId: client.id, eventId: eventId || null, invoiceNumber, status: 'DRAFT', dueDate: dueDate ? new Date(dueDate) : null, retainerPercent: retainerPercent || null, retainerAmountCents: retainerAmountCents || null, taxRateBps: taxRateBps || 0, taxAmountCents: taxAmountCents || 0, subtotalCents, totalCents, balanceDueCents, notes: notes || null, lineItems: { create: (lineItems ?? []).map((li: any, i: number) => ({ description: li.description, quantity: li.quantity, unitCents: li.unitCents, totalCents: li.totalCents, taxable: li.taxable ?? true, sortOrder: i })) } } });
  return NextResponse.json(invoice, { status: 201 });
}
`);

w('src/app/api/events/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: tenant.id }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(event);
}
`);

w('src/app/(tenant)/invoices/[id]/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string, any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { branding: true } });
  if (!tenant) redirect('/onboarding');
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: tenant.id }, include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } } });
  if (!inv) notFound();
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  return (
    <>
      <TopBar title={'Invoice ' + inv.invoiceNumber} />
      <div className="p-8 max-w-4xl space-y-6">
        <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Invoices</Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{inv.invoiceNumber}</h2><Badge variant={IC[inv.status]}>{inv.status}</Badge></div>
          <div className="flex gap-2">
            {inv.status === 'DRAFT' && <form action={'/api/invoices/' + inv.id + '/send'} method="POST"><Button>Send to Client</Button></form>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="font-bold text-base mb-1">{tenant.branding?.companyName ?? tenant.name}</p>
              {tenant.branding?.replyToEmail && <p className="text-gray-600">{tenant.branding.replyToEmail}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="font-semibold text-xs text-gray-400 uppercase mb-1">Bill To</p>
              <p className="font-bold">{inv.client.firstName} {inv.client.lastName}</p>
              <p className="text-gray-600">{inv.client.email}</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Unit</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
              <tbody>
                {inv.lineItems.map(li => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="px-6 py-3">{li.description}</td>
                    <td className="px-6 py-3 text-right">{li.quantity}</td>
                    <td className="px-6 py-3 text-right">{fmt(li.unitCents)}</td>
                    <td className="px-6 py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-4 border-t space-y-1 text-sm text-right">
              <p className="text-gray-500">Subtotal: {fmt(inv.subtotalCents)}</p>
              {inv.taxAmountCents > 0 && <p className="text-gray-500">Tax: {fmt(inv.taxAmountCents)}</p>}
              <p className="text-xl font-bold">Total: {fmt(inv.totalCents)}</p>
              <p className="text-gray-500">Paid: {fmt(inv.amountPaidCents)}</p>
              <p className={'font-bold ' + (inv.balanceDueCents > 0 ? 'text-brand' : 'text-green-600')}>Balance Due: {fmt(inv.balanceDueCents)}</p>
              {inv.dueDate && <p className="text-gray-400 text-xs">Due {format(inv.dueDate,'MMMM d, yyyy')}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/api/invoices/[id]/send/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
import { sendInvoiceLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: tenant.id }, include: { client: true, event: true } });
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const portalUrl = inv.event ? APP + '/portal/' + (inv.event as any).portalToken : APP;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  await sendInvoiceLink({ to: inv.client.email, firstName: inv.client.firstName, companyName: tenant.branding?.companyName ?? tenant.name, invoiceNumber: inv.invoiceNumber, totalFormatted: fmt(inv.totalCents), portalUrl });
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'SENT' } });
  return NextResponse.redirect(new URL('/invoices/' + inv.id, APP));
}
`);

// ─── 14. CONTRACTS ────────────────────────────────────────────────────────────

w('src/app/(tenant)/contracts/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';

const CC: Record<string, any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function ContractsPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const contracts = await prisma.contract.findMany({ where: { tenantId: tenant.id }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Contracts" />
      <div className="p-8 space-y-6">
        <div className="flex justify-end"><Link href="/contracts/new"><Button>New Contract</Button></Link></div>
        <Card>
          <CardContent className="p-0">
            {contracts.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>No contracts yet. Create one from an event or the button above.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-semibold text-sm">{c.title}</p>{c.event && <p className="text-xs text-gray-400">{c.event.title}</p>}</td>
                      <td className="px-6 py-4 text-sm">{c.client.firstName} {c.client.lastName}</td>
                      <td className="px-6 py-4"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td>
                      <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/contracts/new/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function NewContractPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get('eventId');
  const [title, setTitle] = useState('Event Services Agreement');
  const [selectedEvent, setSelectedEvent] = useState(eventId ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/events').then(r => r.json()).then(setEvents);
    fetch('/api/contracts/templates').then(r => r.json()).then(setTemplates);
  }, []);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, eventId: selectedEvent || null, templateId: selectedTemplate || null }) });
      const data = await res.json();
      if (res.ok) router.push('/contracts/' + data.id);
      else alert(data.error ?? 'Failed');
    } finally { setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Contract" />
      <div className="p-8 max-w-lg">
        <Card>
          <CardHeader><CardTitle>Create Contract</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Contract Title</label><Input value={title} onChange={e => setTitle(e.target.value)}/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Link to Event</label>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event (optional) —</option>
                {events.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </Select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <Select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">— Select Template —</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Contract'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/api/contracts/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export async function POST(req: NextRequest) {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, eventId, templateId } = await req.json();
  let clientId: string | null = null; let renderedContent = ''; let templateContent = '';
  let template = templateId ? await prisma.contractTemplate.findFirst({ where: { id: templateId, tenantId: tenant.id } }) : await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!template) template = await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id } });
  templateContent = template?.bodyHtml ?? '<p>This agreement is between {{host.company_name}} and {{client.full_name}}.</p>';
  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: tenant.id }, include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } } } });
    if (event) { clientId = event.clientId; const ctx = buildCtx({ client: event.client, event, invoice: event.invoices[0] ?? null, contract: null, branding: tenant.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' }); renderedContent = parseMergeTags(templateContent, ctx); }
  } else { renderedContent = templateContent; }
  if (!clientId && eventId) return NextResponse.json({ error: 'Event not found or no client' }, { status: 404 });
  if (!clientId) {
    const latestEvent = await prisma.event.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    if (!latestEvent) return NextResponse.json({ error: 'No clients found. Create an event first.' }, { status: 400 });
    clientId = latestEvent.clientId;
  }
  const contract = await prisma.contract.create({ data: { tenantId: tenant.id, clientId, eventId: eventId ?? null, templateId: template?.id ?? null, title: title ?? 'Service Agreement', status: 'DRAFT', templateContent, renderedContent } });
  return NextResponse.json(contract, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json([], { status: 200 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json([], { status: 200 });
  const contracts = await prisma.contract.findMany({ where: { tenantId: tenant.id }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(contracts);
}
`);

w('src/app/api/contracts/templates/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json([], { status: 200 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json([], { status: 200 });
  const templates = await prisma.contractTemplate.findMany({ where: { tenantId: tenant.id }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  return NextResponse.json(templates);
}
`);

w('src/app/(tenant)/contracts/[id]/page.tsx', `
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignatureCanvas } from '@/components/contracts/SignatureCanvas';
import { ArrowLeft, Send, Lock, Download } from 'lucide-react';
import Link from 'next/link';

const CC: Record<string, any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sigData, setSigData] = useState('');
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { fetch('/api/contracts/' + id).then(r => r.json()).then(d => { setContract(d); setLoading(false); }); }, [id]);

  async function hostSign() {
    if (!sigData) return alert('Please draw your signature first.');
    setSigning(true);
    const res = await fetch('/api/contracts/' + id + '/sign/host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signatureDataUrl: sigData }) });
    const d = await res.json();
    if (res.ok) setContract((c: any) => ({ ...c, status: d.status, pdfUrl: d.pdfUrl, hostSignedAt: new Date().toISOString() }));
    else alert(d.error);
    setSigning(false);
  }

  async function sendToClient() {
    setSending(true);
    const res = await fetch('/api/contracts/' + id + '/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiryDays: 14 }) });
    const d = await res.json();
    if (res.ok) { setContract((c: any) => ({ ...c, status: 'SENT_TO_CLIENT' })); alert('Contract sent to client!'); }
    else alert(d.error);
    setSending(false);
  }

  if (loading) return <><TopBar title="Contract"/><div className="p-8 text-gray-400">Loading...</div></>;
  if (!contract) return <><TopBar title="Contract"/><div className="p-8 text-gray-400">Contract not found.</div></>;

  const canHostSign = contract.status !== 'FULLY_EXECUTED' && contract.status !== 'VOIDED' && !contract.hostSignedAt;
  const canSend = contract.status === 'DRAFT' || contract.status === 'HOST_SIGNED';

  return (
    <>
      <TopBar title={contract.title} />
      <div className="p-8 max-w-4xl space-y-6">
        <Link href="/contracts" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Contracts</Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{contract.title}</h2><Badge variant={CC[contract.status]}>{(contract.status ?? '').replace(/_/g,' ')}</Badge></div>
          <div className="flex gap-2">
            {canSend && <Button variant="outline" onClick={sendToClient} disabled={sending}><Send className="w-4 h-4 mr-1"/>{sending ? 'Sending...' : 'Send to Client'}</Button>}
            {contract.pdfUrl && <a href={contract.pdfUrl} target="_blank" rel="noopener noreferrer"><Button variant="outline"><Download className="w-4 h-4 mr-1"/>Download PDF</Button></a>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client</p><p className="font-medium">{contract.client?.firstName} {contract.client?.lastName}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Client Signed</p><p className="font-medium">{contract.clientSignedAt ? new Date(contract.clientSignedAt).toLocaleDateString() : 'Pending'}</p></div>
          <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400 mb-1">Host Signed</p><p className="font-medium">{contract.hostSignedAt ? new Date(contract.hostSignedAt).toLocaleDateString() : 'Pending'}</p></div>
        </div>
        <Card>
          <CardHeader><CardTitle>Contract Content</CardTitle></CardHeader>
          <CardContent>
            <div className="prose max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: contract.renderedContent ?? '' }} />
          </CardContent>
        </Card>
        {canHostSign && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4 text-brand"/>Your Signature</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">Sign below to countersign this contract.</p>
              <SignatureCanvas onCapture={setSigData} />
              <Button onClick={hostSign} disabled={signing || !sigData}>{signing ? 'Signing...' : 'Sign Contract'}</Button>
            </CardContent>
          </Card>
        )}
        {contract.status === 'FULLY_EXECUTED' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-green-600"/>
            <div><p className="font-semibold text-green-800">Fully Executed</p><p className="text-sm text-green-700">Both parties have signed. The contract is locked and legally binding.</p></div>
          </div>
        )}
      </div>
    </>
  );
}
`);

w('src/app/api/contracts/[id]/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: tenant.id }, include: { client: true, event: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(c);
}
`);

// ─── 15. AUTOMATION ───────────────────────────────────────────────────────────

w('src/app/(tenant)/automation/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Mail } from 'lucide-react';

const triggerLabel: Record<string, string> = {
  LEAD_CREATED: 'Lead Created', QUOTE_SENT: 'Quote Sent', BOOKING_CONFIRMED: 'Booking Confirmed',
  EVENT_DATE_MINUS_14_DAYS: '14 Days Before Event', EVENT_DATE_MINUS_7_DAYS: '7 Days Before Event',
  EVENT_DATE_MINUS_1_DAY: 'Day Before Event', EVENT_DATE_PLUS_1_DAY: 'Day After Event',
  EVENT_DATE_PLUS_3_DAYS: '3 Days After Event', INVOICE_SENT: 'Invoice Sent',
  PAYMENT_RECEIVED: 'Payment Received', CONTRACT_SENT: 'Contract Sent',
  CONTRACT_FULLY_EXECUTED: 'Contract Fully Executed', GALLERY_PUBLISHED: 'Gallery Published',
};

export default async function AutomationPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const rules = await prisma.automationRule.findMany({ where: { tenantId: tenant.id }, include: { emailTemplate: { select: { name: true, subject: true } } }, orderBy: [{ trigger: 'asc' }, { sortOrder: 'asc' }] });
  const executions = await prisma.automationExecution.groupBy({ by: ['ruleId'], where: { tenantId: tenant.id }, _count: { _all: true } });
  const execMap = Object.fromEntries(executions.map(e => [e.ruleId, e._count._all]));

  return (
    <>
      <TopBar title="Automation" />
      <div className="p-8 space-y-6">
        <div className="bg-brand-surface border border-brand/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-brand mt-0.5"/>
            <div>
              <p className="font-semibold text-brand-dark">Email Automation</p>
              <p className="text-sm text-gray-600 mt-1">Rules trigger automated emails at key points in your client journey. SMS is available in a future update.</p>
            </div>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>Active Rules ({rules.filter(r => r.isActive).length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><Zap className="w-10 h-10 mx-auto mb-3 opacity-30"/><p>No automation rules yet. Rules will be added via the settings API.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Rule</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Trigger</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Template</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Sent</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th></tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{r.name}</p>{r.description && <p className="text-xs text-gray-400">{r.description}</p>}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{triggerLabel[r.trigger] ?? r.trigger}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1"><Mail className="w-3 h-3 text-gray-400"/>{r.emailTemplate?.name ?? '—'}</div></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{execMap[r.id] ?? 0}</td>
                      <td className="px-6 py-4"><Badge variant={r.isActive ? 'success' : 'default'}>{r.isActive ? 'Active' : 'Paused'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// ─── 16. SETTINGS ─────────────────────────────────────────────────────────────

w('src/app/(tenant)/settings/page.tsx', `
import { redirect } from 'next/navigation';
export default function SettingsPage() { redirect('/settings/branding'); }
`);

w('src/app/(tenant)/settings/branding/page.tsx', `
'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];

export default function BrandingSettingsPage() {
  const [form, setForm] = useState({ companyName: '', primaryColor: '#F97316', secondaryColor: '#EA6100', replyToEmail: '', supportPhone: '', websiteUrl: '', invoiceFooterText: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { fetch('/api/settings/branding').then(r => r.json()).then(d => { if (d && !d.error) setForm(p => ({ ...p, ...d })); }); }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => (
            <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'branding' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle>Company Branding</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label><Input value={form.companyName} onChange={e => set('companyName',e.target.value)} placeholder="Pixel Perfect Photo Booths"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label><div className="flex gap-2"><input type="color" value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label><div className="flex gap-2"><input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reply-to Email</label><Input type="email" value={form.replyToEmail} onChange={e => set('replyToEmail',e.target.value)} placeholder="hello@yourdomain.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label><Input value={form.supportPhone} onChange={e => set('supportPhone',e.target.value)} placeholder="(555) 123-4567"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label><Input value={form.websiteUrl} onChange={e => set('websiteUrl',e.target.value)} placeholder="https://yourbusiness.com"/></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer Text</label><Textarea value={form.invoiceFooterText} onChange={e => set('invoiceFooterText',e.target.value)} placeholder="Thank you for your business!"/></div>
            <div className="col-span-2 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : saved ? '\u2713 Saved' : 'Save Changes'}</Button></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/api/settings/branding/route.ts', `
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { branding: true } });
  return NextResponse.json(tenant?.branding ?? {});
}
export async function PATCH(req: NextRequest) {
  const { orgId } = auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const b = await prisma.tenantBranding.upsert({ where: { tenantId: tenant.id }, update: body, create: { tenantId: tenant.id, ...body } });
  return NextResponse.json(b);
}
`);

w('src/app/(tenant)/settings/billing/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];

export default async function BillingSettingsPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId }, include: { stripeSubscription: true, stripeConnect: true } });
  if (!tenant) redirect('/onboarding');
  const sub = tenant.stripeSubscription;
  const conn = tenant.stripeConnect;
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'billing' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5"/>Platform Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="font-semibold">{sub?.plan ?? 'Free Trial'}</p><p className="text-sm text-gray-500">{sub ? 'Status: ' + sub.status : 'Trial ends in 14 days'}</p></div>
              <Badge variant={sub?.status === 'ACTIVE' ? 'success' : 'warning'}>{sub?.status ?? 'TRIALING'}</Badge>
            </div>
            {!sub && <Button>Upgrade to Pro</Button>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5"/>Stripe Connect — Accept Client Payments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {conn?.onboardingStatus === 'ACTIVE' ? (
              <div className="flex items-center gap-3 text-green-700 bg-green-50 rounded-xl p-4"><CheckCircle2 className="w-5 h-5"/><div><p className="font-semibold">Connected</p><p className="text-sm">Charges enabled: {conn.chargesEnabled ? 'Yes' : 'No'} \u2022 Payouts: {conn.payoutsEnabled ? 'Yes' : 'No'}</p></div></div>
            ) : conn ? (
              <div className="flex items-center gap-3 text-yellow-700 bg-yellow-50 rounded-xl p-4"><AlertCircle className="w-5 h-5"/><div><p className="font-semibold">Onboarding Incomplete</p><p className="text-sm">Finish setting up your Stripe account to accept payments.</p></div></div>
            ) : (
              <div><p className="text-sm text-gray-600 mb-4">Connect your Stripe account to accept credit card payments from clients directly through their booking portal.</p></div>
            )}
            <a href="/api/stripe/connect/authorize"><Button variant={conn?.onboardingStatus === 'ACTIVE' ? 'outline' : 'default'}>{conn ? 'Update Stripe Connection' : 'Connect Stripe Account'}</Button></a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/settings/team/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { format } from 'date-fns';

const tabs = [['branding','Branding'],['billing','Billing'],['team','Team']];
const RC: Record<string, any> = { HOST_ADMIN: 'brand', TEAM_MEMBER: 'default' };
const SC: Record<string, any> = { ACTIVE: 'success', INVITED: 'info', SUSPENDED: 'danger' };

export default async function TeamSettingsPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const members = await prisma.tenantMembership.findMany({ where: { tenantId: tenant.id }, include: { user: { select: { name: true, email: true, avatarUrl: true } } }, orderBy: { joinedAt: 'desc' } });
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'team' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <p className="text-sm text-gray-500">Invite team members via <strong>Clerk Organizations</strong> in your Clerk dashboard. They will appear here automatically once they join.</p>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Team Members ({members.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-6 py-4"><p className="font-medium text-sm">{m.user.name}</p><p className="text-xs text-gray-400">{m.user.email}</p></td>
                    <td className="px-6 py-4"><Badge variant={RC[m.role]}>{m.role.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4"><Badge variant={SC[m.status]}>{m.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{m.joinedAt ? format(m.joinedAt,'MMM d, yyyy') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/gallery/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';
const GC: Record<string, any> = { PENDING_UPLOAD:'default', PENDING_REVIEW:'info', APPROVED:'success', CHANGES_REQUESTED:'warning' };

export default async function GalleryPage() {
  const { orgId } = auth();
  if (!orgId) redirect('/onboarding');
  const tenant = await prisma.tenant.findFirst({ where: { clerkOrgId: orgId } });
  if (!tenant) redirect('/onboarding');
  const galleries = await prisma.gallery.findMany({ where: { tenantId: tenant.id }, include: { event: { select: { title: true, eventDate: true } }, _count: { select: { assets: true } } }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <TopBar title="Gallery" />
      <div className="p-8">
        <Card>
          <CardContent className="p-0">
            {galleries.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Gallery folders are created automatically when you create an event.</p><p className="text-sm mt-2">Upload photos from each event's detail page.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Gallery</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Approval</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Published</th></tr></thead>
                <tbody>
                  {galleries.map(g => (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{g.title}</p><p className="text-xs text-gray-400">{g.event.title} \u2022 {format(g.event.eventDate,'MMM d, yyyy')}</p></td>
                      <td className="px-6 py-4 text-sm">{g._count.assets}</td>
                      <td className="px-6 py-4"><Badge variant={GC[g.approvalStatus]}>{g.approvalStatus.replace(/_/g,' ')}</Badge></td>
                      <td className="px-6 py-4"><Badge variant={g.isPublished ? 'success' : 'default'}>{g.isPublished ? 'Published' : 'Draft'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
`);

// ─── 17. SUPER ADMIN ──────────────────────────────────────────────────────────

w('src/app/(platform)/super-admin/layout.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = auth();
  if (!userId) redirect('/sign-in');
  const meta = sessionClaims?.metadata as any;
  if (meta?.globalRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return <>{children}</>;
}
`);

w('src/app/(platform)/super-admin/page.tsx', `
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import Link from 'next/link';
import { Camera, Users, TrendingUp, AlertTriangle } from 'lucide-react';

const SC: Record<string, any> = { TRIAL:'warning', ACTIVE:'success', SUSPENDED:'danger', CANCELLED:'default' };
const ConnS: Record<string, any> = { NOT_CONNECTED:'default', ONBOARDING_INITIATED:'info', ACTIVE:'success', RESTRICTED:'warning', DEAUTHORIZED:'danger' };

export default async function SuperAdminPage() {
  const { userId, sessionClaims } = auth();
  if (!userId) redirect('/sign-in');
  const meta = sessionClaims?.metadata as any;
  if (meta?.globalRole !== 'SUPER_ADMIN') redirect('/dashboard');

  const [tenants, totalUsers, totalEvents] = await Promise.all([
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true, clients: true } }, branding: { select: { companyName: true } } } }),
    prisma.user.count(),
    prisma.event.count(),
  ]);

  const overview = { total: tenants.length, active: tenants.filter(t => t.status === 'ACTIVE').length, trial: tenants.filter(t => t.status === 'TRIAL').length, suspended: tenants.filter(t => t.status === 'SUSPENDED').length };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-canvas text-white px-8 py-4 flex items-center gap-3">
        <Camera className="w-5 h-5 text-brand"/>
        <span className="font-bold">Photo Booth CRM</span>
        <span className="text-white/30 mx-2">|</span>
        <span className="text-sm text-white/70">Super Admin Console</span>
      </div>
      <div className="p-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[['Total Hosts', overview.total, Users, 'text-brand'], ['Active', overview.active, TrendingUp, 'text-green-500'], ['Trial', overview.trial, Camera, 'text-yellow-500'], ['Suspended', overview.suspended, AlertTriangle, 'text-red-500']].map(([label, val, Icon, color]) => (
            <Card key={label as string}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">{label}</p>
                  <span className={color as string}>{typeof Icon === 'function' ? <Icon className="w-5 h-5"/> : null}</span>
                </div>
                <p className="text-3xl font-bold">{val}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalUsers}</p><p className="text-sm text-gray-500 mt-1">Total Users</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{totalEvents}</p><p className="text-sm text-gray-500 mt-1">Total Events</p></CardContent></Card>
          <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-brand">{tenants.filter(t => t.stripeConnect?.chargesEnabled).length}</p><p className="text-sm text-gray-500 mt-1">Stripe Connected</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>All Hosts</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Company</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plan</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Stripe</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{t.branding?.companyName ?? t.name}</p><p className="text-xs text-gray-400">/{t.slug}</p></td>
                    <td className="px-6 py-4"><Badge variant={SC[t.status]}>{t.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t.stripeSubscription?.plan ?? 'Trial'}</td>
                    <td className="px-6 py-4"><Badge variant={ConnS[t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED']} className="text-xs">{t.stripeConnect?.onboardingStatus ?? 'NOT_CONNECTED'}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-600">{t._count.events}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(t.createdAt,'MMM d, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

// ─── 18. CLIENT PORTAL ────────────────────────────────────────────────────────

w('src/app/portal/[portalToken]/page.tsx', `
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SignatureCanvas } from '@/components/contracts/SignatureCanvas';
import { CheckCircle2, Calendar, MapPin, FileText, Receipt, Camera, Lock, AlertCircle } from 'lucide-react';

type PortalData = { booking: any; client: any; branding: any; invoice: any; contract: any; gallery: any; meta: any };

function Spinner() { return <div className="w-8 h-8 border-4 border-brand/20 border-t-brand rounded-full animate-spin mx-auto"/>; }

function NavTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={'px-5 py-3 text-sm font-semibold border-b-2 transition-colors ' + (active ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>{children}</button>;
}

export default function PortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'booking'|'invoice'|'contract'|'gallery'>('booking');
  const [sigData, setSigData] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    fetch('/api/portal/' + portalToken)
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); } else { setData(d); if (!d.meta.tabs.contract) setTab('booking'); } })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [portalToken]);

  async function signContract() {
    if (!sigData) { setSignError('Please draw your signature first.'); return; }
    if (!data?.contract) return;
    setSigning(true); setSignError('');
    const res = await fetch('/api/contracts/' + data.contract.contractId + '/sign/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientToken: data.contract.clientToken, signatureDataUrl: sigData, hasReadAndAgreed: true }) });
    const d = await res.json();
    if (res.ok) { setSigned(true); setData(prev => prev ? { ...prev, contract: { ...prev.contract, clientHasSigned: true, status: d.status, pdfUrl: d.pdfUrl } } : prev); }
    else { setSignError(d.error ?? 'Signing failed. Please try again.'); }
    setSigning(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner/></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-center"><AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3"/><p className="text-gray-600">{error}</p></div></div>;
  if (!data) return null;

  const { booking, client, branding, invoice, contract, meta } = data;
  const pc = branding.primaryColor || '#F97316';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {branding.logoUrl && <img src={branding.logoUrl} alt={branding.companyName} className="h-8 object-contain"/>}
          <div>
            <p className="font-bold text-sm text-gray-900">{branding.companyName}</p>
            <p className="text-xs text-gray-500">Booking Portal</p>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 border-t">
          <NavTab active={tab==='booking'} onClick={() => setTab('booking')}><Calendar className="inline w-3.5 h-3.5 mr-1.5"/>Booking</NavTab>
          {meta.tabs.invoice && <NavTab active={tab==='invoice'} onClick={() => setTab('invoice')}><Receipt className="inline w-3.5 h-3.5 mr-1.5"/>Invoice</NavTab>}
          {meta.tabs.contract && <NavTab active={tab==='contract'} onClick={() => setTab('contract')}><FileText className="inline w-3.5 h-3.5 mr-1.5"/>Contract</NavTab>}
          {meta.tabs.gallery && <NavTab active={tab==='gallery'} onClick={() => setTab('gallery')}><Camera className="inline w-3.5 h-3.5 mr-1.5"/>Gallery</NavTab>}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm p-6 border-l-4" style={{ borderLeftColor: pc }}>
          <p className="text-sm text-gray-500 mb-1">Hi {client.firstName} \u2014 welcome to your booking portal</p>
          <h1 className="text-2xl font-bold text-gray-900">{booking.title}</h1>
          <p className="text-brand font-semibold mt-1">{booking.status?.replace(/_/g,' ')}</p>
        </div>

        {tab === 'booking' && (
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Event Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3"><Calendar className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-400 uppercase font-medium">Date &amp; Time</p><p className="font-semibold">{booking.eventDate}</p>{booking.startTime && <p className="text-gray-600">{booking.startTime}{booking.endTime ? ' \u2013 ' + booking.endTime : ''}</p>}</div></div>
              {booking.venueName && <div className="flex items-start gap-3"><MapPin className="w-4 h-4 mt-0.5 text-gray-400"/><div><p className="text-xs text-gray-400 uppercase font-medium">Venue</p><p className="font-semibold">{booking.venueName}</p>{booking.venueAddress && <p className="text-gray-600">{booking.venueAddress}</p>}</div></div>}
              {booking.packageName && <div className="col-span-2"><p className="text-xs text-gray-400 uppercase font-medium mb-1">Package</p><p className="font-semibold">{booking.packageName}</p></div>}
            </div>
            {branding.contactEmail && <div className="pt-4 border-t text-sm text-gray-500">Questions? <a href={'mailto:' + branding.contactEmail} className="text-brand hover:underline">{branding.contactEmail}</a>{branding.contactPhone && <span className="ml-4">{branding.contactPhone}</span>}</div>}
          </div>
        )}

        {tab === 'invoice' && invoice && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 flex items-center justify-between border-b">
              <div><h2 className="text-lg font-bold">Invoice {invoice.invoiceNumber}</h2><p className="text-sm text-gray-500">{invoice.isPaid ? 'Paid in full' : 'Balance due: ' + invoice.balanceDueFormatted}</p></div>
              <span className={'px-3 py-1 rounded-full text-xs font-bold ' + (invoice.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{invoice.status}</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
              <tbody>{invoice.lineItems?.map((li: any) => (<tr key={li.id} className="border-b"><td className="px-6 py-3">{li.description}</td><td className="px-6 py-3 text-right">{li.quantity}</td><td className="px-6 py-3 text-right font-medium">{new Intl.NumberFormat('en-US',{style:'currency',currency:'usd'}).format(li.totalCents/100)}</td></tr>))}</tbody>
            </table>
            <div className="p-6 border-t text-right space-y-1 text-sm">
              <p className="text-gray-500">Total: {invoice.totalFormatted}</p>
              <p className="text-gray-500">Paid: {invoice.amountPaidFormatted}</p>
              <p className={'text-xl font-bold ' + (invoice.balanceDueCents === 0 ? 'text-green-600' : 'text-gray-900')}>Balance Due: {invoice.balanceDueFormatted}</p>
              {invoice.dueDate && <p className="text-gray-400 text-xs">Due {invoice.dueDate}</p>}
            </div>
            {invoice.canPay && invoice.balanceDueCents > 0 && (
              <div className="px-6 pb-6">
                <button className="w-full py-3 rounded-xl text-white font-bold text-base transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>Pay {invoice.balanceDueFormatted} Online</button>
                <p className="text-xs text-center text-gray-400 mt-2">Secure payment powered by Stripe</p>
              </div>
            )}
          </div>
        )}

        {tab === 'contract' && contract && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <div><h2 className="text-lg font-bold">{contract.title}</h2><p className="text-sm text-gray-500">{contract.status?.replace(/_/g,' ')}</p></div>
              {contract.isFullyExecuted && <span className="flex items-center gap-1.5 text-green-700 bg-green-50 px-3 py-1 rounded-full text-xs font-bold"><Lock className="w-3 h-3"/>Fully Executed</span>}
            </div>
            {contract.renderedContent && <div className="p-6 prose max-w-none text-sm leading-relaxed border-b" dangerouslySetInnerHTML={{ __html: contract.renderedContent }}/>}
            {contract.canSign && !signed && (
              <div className="p-6 space-y-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900">Your Signature</h3>
                <p className="text-sm text-gray-600">By signing, you agree to the terms in this contract.</p>
                <SignatureCanvas onCapture={setSigData}/>
                {signError && <p className="text-red-600 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/>{signError}</p>}
                <button disabled={signing || !sigData} onClick={signContract} className="w-full py-3 rounded-xl text-white font-bold text-base disabled:opacity-50 transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>{signing ? 'Signing...' : 'Sign Contract'}</button>
              </div>
            )}
            {(signed || contract.clientHasSigned) && !contract.isFullyExecuted && (
              <div className="p-6 bg-green-50 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2"/>
                <p className="font-semibold text-green-800">Signature Received</p>
                <p className="text-sm text-green-600">Awaiting countersignature from {branding.companyName}.</p>
              </div>
            )}
            {contract.isFullyExecuted && (
              <div className="p-6 bg-green-50 text-center space-y-3">
                <Lock className="w-10 h-10 text-green-600 mx-auto"/>
                <p className="font-semibold text-green-800">Contract Fully Executed</p>
                {contract.pdfUrl && <a href={contract.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ backgroundColor: pc }}>Download Signed PDF</a>}
              </div>
            )}
          </div>
        )}

        {tab === 'gallery' && <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p className="font-medium">Gallery Coming Soon</p><p className="text-sm mt-1">Your photos will appear here once uploaded.</p></div>}
      </main>

      <footer className="text-center py-8 text-xs text-gray-400">Powered by {branding.companyName}</footer>
    </div>
  );
}
`);

// ─── 19. VERIFICATION + SETUP INSTRUCTIONS ────────────────────────────────────

const EXPECTED_FILES = [
  'package.json','.env.example','next.config.ts','tsconfig.json','tailwind.config.ts','postcss.config.js',
  'prisma/schema.prisma','prisma/seed.ts',
  'src/lib/prisma/client.ts','src/lib/utils.ts','src/lib/rate-limit.ts','src/lib/storage/blob.ts',
  'src/lib/auth/guards.ts','src/lib/contracts/merge-tags.ts','src/lib/contracts/pdf-generator.ts',
  'src/lib/email/send.ts','src/lib/inngest/client.ts','src/lib/inngest/functions.ts',
  'src/middleware.ts',
  'src/app/globals.css','src/app/layout.tsx',
  'src/app/(auth)/sign-in/[[...sign-in]]/page.tsx',
  'src/app/(auth)/sign-up/[[...sign-up]]/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/(tenant)/layout.tsx',
  'src/app/(tenant)/dashboard/page.tsx',
  'src/app/(tenant)/events/page.tsx',
  'src/app/(tenant)/events/new/page.tsx',
  'src/app/(tenant)/events/[id]/page.tsx',
  'src/app/(tenant)/clients/page.tsx',
  'src/app/(tenant)/invoices/page.tsx',
  'src/app/(tenant)/invoices/new/page.tsx',
  'src/app/(tenant)/invoices/[id]/page.tsx',
  'src/app/(tenant)/contracts/page.tsx',
  'src/app/(tenant)/contracts/new/page.tsx',
  'src/app/(tenant)/contracts/[id]/page.tsx',
  'src/app/(tenant)/automation/page.tsx',
  'src/app/(tenant)/gallery/page.tsx',
  'src/app/(tenant)/settings/page.tsx',
  'src/app/(tenant)/settings/branding/page.tsx',
  'src/app/(tenant)/settings/billing/page.tsx',
  'src/app/(tenant)/settings/team/page.tsx',
  'src/app/(platform)/super-admin/layout.tsx',
  'src/app/(platform)/super-admin/page.tsx',
  'src/app/portal/[portalToken]/page.tsx',
  'src/app/api/events/route.ts','src/app/api/events/[id]/route.ts',
  'src/app/api/invoices/route.ts','src/app/api/invoices/[id]/send/route.ts',
  'src/app/api/contracts/route.ts','src/app/api/contracts/templates/route.ts',
  'src/app/api/contracts/[id]/route.ts',
  'src/app/api/contracts/[id]/sign/client/route.ts',
  'src/app/api/contracts/[id]/sign/host/route.ts',
  'src/app/api/contracts/[id]/send/route.ts',
  'src/app/api/portal/[portalToken]/route.ts',
  'src/app/api/public/[tenantSlug]/leads/route.ts',
  'src/app/api/settings/branding/route.ts',
  'src/app/api/super-admin/metrics/route.ts',
  'src/app/api/stripe/connect/authorize/route.ts',
  'src/app/api/stripe/connect/callback/route.ts',
  'src/app/api/stripe/webhooks/platform/route.ts',
  'src/app/api/webhooks/clerk/route.ts',
  'src/app/api/inngest/route.ts',
  'src/app/embed/[tenantSlug]/inquiry/route.ts',
  'src/components/ui/button.tsx','src/components/ui/card.tsx',
  'src/components/ui/input.tsx','src/components/ui/badge.tsx',
  'src/components/ui/select.tsx','src/components/ui/textarea.tsx','src/components/ui/modal.tsx',
  'src/components/layout/Sidebar.tsx','src/components/layout/TopBar.tsx',
  'src/components/contracts/SignatureCanvas.tsx',
];

console.log('\n\ud83d\udcca Verifying files...\n');
let ok = 0, missing = 0;
for (const f of EXPECTED_FILES) {
  const full = path.join(ROOT, f);
  if (fs.existsSync(full)) { ok++; }
  else { process.stdout.write('  \u274c MISSING: ' + f + '\n'); missing++; }
}

console.log('\n' + (missing === 0
  ? '\u2705 All ' + ok + ' files created successfully!'
  : '\u26a0\ufe0f  ' + ok + ' files OK, ' + missing + ' missing'));

console.log(`
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\ud83d\udcf8  Photo Booth CRM \u2014 Project Created at ./photo-booth-crm/
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

SETUP CHECKLIST
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

STEP 1 \u2014 Install dependencies
  cd photo-booth-crm && npm install

STEP 2 \u2014 Neon PostgreSQL (free at neon.tech)
  \u25a2 Create a new project at neon.tech
  \u25a2 Copy the connection string
  \u25a2 Set DATABASE_URL in .env.local

STEP 3 \u2014 Clerk (free at clerk.com)
  \u25a2 Create an application at clerk.com
  \u25a2 Enable Organizations in Clerk dashboard
  \u25a2 Copy NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
  \u25a2 Create Webhook endpoint: https://yourapp.vercel.app/api/webhooks/clerk
      Events to subscribe to:
        \u2022 organization.created
        \u2022 user.created
        \u2022 user.updated
        \u2022 organizationMembership.created
        \u2022 organizationMembership.deleted
  \u25a2 Copy webhook signing secret to CLERK_WEBHOOK_SECRET

STEP 4 \u2014 Resend (free at resend.com)
  \u25a2 Create account, verify your sending domain
  \u25a2 Copy API key to RESEND_API_KEY
  \u25a2 Set EMAIL_FROM to your verified sending address

STEP 5 \u2014 Stripe (free until payments at stripe.com)
  \u25a2 Create account, get test keys
  \u25a2 Set STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  \u25a2 Create webhook for platform: /api/stripe/webhooks/platform
      Event: customer.subscription.updated, invoice.payment_failed
  \u25a2 Copy STRIPE_WEBHOOK_SECRET
  \u25a2 Enable Stripe Connect in your Dashboard \u2192 Connect settings
  \u25a2 Set STRIPE_PLATFORM_FEE_PERCENT (e.g. 2)

STEP 6 \u2014 Inngest (free at inngest.com)
  \u25a2 Create account, create app
  \u25a2 Copy INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY

STEP 7 \u2014 Deploy to Vercel (free at vercel.com)
  \u25a2 Push to GitHub, import in Vercel
  \u25a2 Add all environment variables from .env.example
  \u25a2 Enable Vercel Blob Storage in Storage tab
      (BLOB_READ_WRITE_TOKEN will be auto-injected)
  \u25a2 Set NEXT_PUBLIC_APP_URL to your Vercel URL

STEP 8 \u2014 Initialize database
  npm run db      # prisma generate + db push
  npm run seed    # seed test data (2 companies + sample event)

STEP 9 \u2014 Make yourself Super Admin
  Option A (Clerk metadata):
    Clerk Dashboard \u2192 Users \u2192 [your user] \u2192 Public Metadata:
    { "globalRole": "SUPER_ADMIN" }

  Option B (SQL):
    UPDATE users SET global_role='SUPER_ADMIN'
    WHERE email='your@email.com';

STEP 10 \u2014 Test the application
  \u25a2 Sign up at /sign-up and create your company
  \u25a2 Create a test event at /events/new
  \u25a2 Test lead capture: /embed/your-slug/inquiry
  \u25a2 Test client portal: /portal/[portalToken]
  \u25a2 Access super admin at /super-admin

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
LEAD CAPTURE EMBED (copy to your website)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

<iframe src="https://yourapp.vercel.app/embed/YOUR-SLUG/inquiry"
        width="100%" height="680" frameborder="0"
        style="border:none;max-width:600px;display:block">
</iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'pbcrm:resize') {
      document.querySelector('iframe').height = e.data.height + 32;
    }
  });
</script>

Replace YOUR-SLUG with your company's slug (e.g. pixel-perfect).

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
TO ZIP THE PROJECT
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  macOS / Linux:
    zip -r photo-booth-crm.zip photo-booth-crm/ --exclude "*/node_modules/*" --exclude "*/.next/*"

  Windows (PowerShell):
    Compress-Archive -Path .\\photo-booth-crm -DestinationPath .\\photo-booth-crm.zip

  Or use: npx bestzip photo-booth-crm.zip photo-booth-crm/
`);
