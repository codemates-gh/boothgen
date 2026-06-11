#!/usr/bin/env node
/**
 * build-v2.js — Full feature build
 * Quote system, portal redesign, R2 gallery, archive, invoice UI, payment schedule
 */
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function w(p, c) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c, 'utf8');
  process.stdout.write('  ✓ ' + p + '\n');
}
console.log('\n🔧 Building v2 features...\n');

// ── 1. Schema additions ───────────────────────────────────────────────────────
const schemaPath = path.join(ROOT, 'prisma/schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Add QuoteStatus enum
if (!schema.includes('QuoteStatus')) {
  schema = schema.replace(
    'enum ContractStatus {',
    `enum QuoteStatus { DRAFT SENT VIEWED ACCEPTED DECLINED EXPIRED }\nenum PaymentMilestoneStatus { PENDING PAID OVERDUE }\nenum ContractStatus {`
  );
}
// Add ARCHIVED to EventStatus
if (!schema.includes('ARCHIVED')) {
  schema = schema.replace('CANCELLED }', 'CANCELLED ARCHIVED }');
}
// Add QUOTE_SENT etc to AutomationTrigger
if (!schema.includes('QUOTE_SENT')) {
  schema = schema.replace(
    'GALLERY_PUBLISHED\n}',
    'GALLERY_PUBLISHED\n  QUOTE_SENT QUOTE_ACCEPTED QUOTE_DECLINED DEPOSIT_PAID BALANCE_PAID\n}'
  );
}
// Add Quote relation to Tenant
if (!schema.includes('quotes              Quote[]')) {
  schema = schema.replace(
    '  servicePackages      ServicePackage[]',
    '  servicePackages      ServicePackage[]\n  quotes               Quote[]\n  paymentMilestones    PaymentMilestone[]'
  );
}
// Add Quote relation to Event
if (!schema.includes('quotes        Quote[]')) {
  schema = schema.replace(
    '  gallery       Gallery?',
    '  gallery       Gallery?\n  quotes        Quote[]'
  );
}
// Add milestones to Invoice
if (!schema.includes('milestones    PaymentMilestone[]')) {
  schema = schema.replace(
    '  payments      Payment[]',
    '  payments      Payment[]\n  milestones    PaymentMilestone[]'
  );
}
// Add Quote and PaymentMilestone models
if (!schema.includes('model Quote {')) {
  schema += `
model Quote {
  id             String      @id @default(cuid())
  tenantId       String
  eventId        String
  clientId       String
  quoteNumber    String
  status         QuoteStatus @default(DRAFT)
  subtotalCents  Int         @default(0)
  taxRatePercent Float       @default(0)
  taxAmountCents Int         @default(0)
  discountCents  Int         @default(0)
  totalCents     Int         @default(0)
  notes          String?
  terms          String?
  validUntil     DateTime?
  sentAt         DateTime?
  viewedAt       DateTime?
  acceptedAt     DateTime?
  declinedAt     DateTime?
  declineReason  String?
  clientSignatureData String?
  clientSignedAt DateTime?
  clientIpAddress String?
  clientName     String?
  portalToken    String      @unique @default(cuid())
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  tenant    Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event     Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  client    Client        @relation(fields: [clientId], references: [id])
  lineItems QuoteLineItem[]
  @@index([tenantId])
  @@index([eventId])
  @@map("quotes")
}

model QuoteLineItem {
  id          String @id @default(cuid())
  quoteId     String
  description String
  quantity    Float  @default(1)
  unitCents   Int    @default(0)
  totalCents  Int    @default(0)
  sortOrder   Int    @default(0)
  quote Quote @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  @@map("quote_line_items")
}

model PaymentMilestone {
  id          String                 @id @default(cuid())
  invoiceId   String
  tenantId    String
  label       String
  amountCents Int
  dueDate     DateTime
  status      PaymentMilestoneStatus @default(PENDING)
  paidAt      DateTime?
  stripePaymentIntentId String?
  createdAt   DateTime @default(now())
  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([invoiceId])
  @@map("payment_milestones")
}
`;
}
fs.writeFileSync(schemaPath, schema, 'utf8');
process.stdout.write('  ✓ prisma/schema.prisma\n');

// ── 2. R2 storage client ──────────────────────────────────────────────────────
w('src/lib/storage/r2.ts', `import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: \`https://\${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com\`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? 'boothgen-gallery';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
  return PUBLIC_URL + '/' + key;
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(r2, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: 3600 });
}

export function r2KeyFromUrl(url: string): string {
  return url.replace(PUBLIC_URL + '/', '');
}
`);

// ── 3. Quote list page ────────────────────────────────────────────────────────
w('src/app/(tenant)/quotes/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';

const QC: Record<string,any> = { DRAFT:'default', SENT:'info', VIEWED:'warning', ACCEPTED:'success', DECLINED:'danger', EXPIRED:'default' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'usd' }).format(c/100);

export default async function QuotesPage() {
  const session = await requireTenantSession();
  const quotes = await prisma.quote.findMany({
    where: { tenantId: session.tenantId },
    include: { client: true, event: true },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return (
    <>
      <TopBar title="Quotes" />
      <div className="p-8">
        <div className="flex justify-end mb-6">
          <Link href="/quotes/new"><Button><Plus className="w-4 h-4 mr-2"/>New Quote</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
              <p className="font-medium mb-2">No quotes yet</p>
              <Link href="/quotes/new"><Button className="mt-2">Create First Quote</Button></Link>
            </div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Quote</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3"></th>
              </tr></thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-sm">{q.quoteNumber}</td>
                    <td className="px-6 py-4 text-sm">{q.client.firstName} {q.client.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{q.event.title}</td>
                    <td className="px-6 py-4 text-sm font-medium">{fmt(q.totalCents)}</td>
                    <td className="px-6 py-4"><Badge variant={QC[q.status]}>{q.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(q.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-right"><Link href={'/quotes/' + q.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
`);

// ── 4. Quote APIs ─────────────────────────────────────────────────────────────
w('src/app/api/quotes/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const quotes = await prisma.quote.findMany({
    where: { tenantId: session.tenantId },
    include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { eventId, lineItems, notes, terms, taxRatePercent, validUntil, discountCents } = body;
  if (!eventId) return NextResponse.json({ error: 'Event required' }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const count = await prisma.quote.count({ where: { tenantId: session.tenantId } });
  const quoteNumber = 'Q-' + String(count + 1).padStart(4, '0');
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const discount = discountCents || 0;
  const total = subtotal + tax - discount;

  const quote = await prisma.quote.create({
    data: {
      tenantId: session.tenantId, eventId, clientId: event.clientId,
      quoteNumber, notes: notes || null, terms: terms || null,
      taxRatePercent: taxRatePercent || 0, taxAmountCents: tax,
      subtotalCents: subtotal, discountCents: discount, totalCents: total,
      validUntil: validUntil ? new Date(validUntil) : null,
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity || 1, unitCents: li.unitCents || 0, totalCents: li.totalCents || 0, sortOrder: i })) },
    },
    include: { lineItems: true },
  });
  return NextResponse.json(quote, { status: 201 });
}
`);

w('src/app/api/quotes/[id]/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(quote);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = await prisma.quote.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (q.status !== 'DRAFT') return NextResponse.json({ error: 'Only draft quotes can be edited' }, { status: 400 });
  const body = await req.json();
  const { lineItems, notes, terms, taxRatePercent, validUntil, discountCents } = body;
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const discount = discountCents || 0;
  const total = subtotal + tax - discount;
  await prisma.quoteLineItem.deleteMany({ where: { quoteId: params.id } });
  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: {
      notes: notes || null, terms: terms || null, taxRatePercent: taxRatePercent || 0,
      taxAmountCents: tax, subtotalCents: subtotal, discountCents: discount, totalCents: total,
      validUntil: validUntil ? new Date(validUntil) : null,
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity || 1, unitCents: li.unitCents || 0, totalCents: li.totalCents || 0, sortOrder: i })) },
    },
    include: { lineItems: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.quote.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
`);

w('src/app/api/quotes/[id]/send/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true },
  });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.quote.update({ where: { id: params.id }, data: { status: 'SENT', sentAt: new Date() } });
  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL || '') + '/portal/' + q.event.portalToken + '?tab=quote';
  // Send email via Resend
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@boothgen.vercel.app',
      to: q.client.email,
      subject: 'Your Quote from ' + (q.event.title || 'Us'),
      html: '<p>Hi ' + q.client.firstName + ',</p><p>Your quote is ready to review. Please click the link below to view and accept your quote:</p><p><a href="' + portalUrl + '" style="background:#F97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Review Your Quote</a></p><p>Thank you!</p>',
    });
  } catch (e) { console.error('Email failed:', e); }
  return NextResponse.json(updated);
}
`);

w('src/app/api/quotes/[id]/accept/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { signatureData, clientName, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({
    where: { id: params.id },
    include: { event: true, tenant: { include: { branding: true, contractTemplates: { where: { isDefault: true }, take: 1 } } }, client: true },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (quote.status !== 'SENT' && quote.status !== 'VIEWED') return NextResponse.json({ error: 'Quote cannot be accepted' }, { status: 400 });
  const now = new Date();
  await prisma.quote.update({
    where: { id: params.id },
    data: { status: 'ACCEPTED', acceptedAt: now, clientSignatureData: signatureData, clientSignedAt: now, clientIpAddress: ip, clientName },
  });
  // Update event status to QUOTED -> BOOKED
  await prisma.event.update({ where: { id: quote.eventId }, data: { status: 'BOOKED' } });
  // Auto-generate contract from default template
  const template = quote.tenant.contractTemplates[0];
  if (template) {
    const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
    const eventDate = quote.event.eventDate;
    let body = template.bodyHtml
      .replace(/{{client\.full_name}}/g, quote.client.firstName + ' ' + quote.client.lastName)
      .replace(/{{client\.first_name}}/g, quote.client.firstName)
      .replace(/{{client\.email}}/g, quote.client.email)
      .replace(/{{event\.title}}/g, quote.event.title)
      .replace(/{{event\.date}}/g, eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/{{event\.start_time}}/g, quote.event.startTime ? new Date(quote.event.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
      .replace(/{{event\.end_time}}/g, quote.event.endTime ? new Date(quote.event.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
      .replace(/{{event\.venue_name}}/g, quote.event.venueName || '')
      .replace(/{{event\.venue_address}}/g, quote.event.venueAddress || '')
      .replace(/{{event\.venue_city}}/g, quote.event.venueCity || '')
      .replace(/{{event\.venue_state}}/g, quote.event.venueState || '')
      .replace(/{{event\.package_name}}/g, quote.event.packageName || '')
      .replace(/{{event\.guest_count}}/g, String(quote.event.guestCount || ''))
      .replace(/{{invoice\.total}}/g, fmt(quote.totalCents))
      .replace(/{{host\.company_name}}/g, quote.tenant.branding?.companyName || quote.tenant.name)
      .replace(/{{host\.email}}/g, quote.tenant.branding?.replyToEmail || '')
      .replace(/{{today}}/g, now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
    await prisma.contract.create({
      data: {
        tenantId: quote.tenantId, eventId: quote.eventId, clientId: quote.clientId,
        title: 'Services Agreement — ' + quote.event.title,
        bodyHtml: body, status: 'DRAFT',
      },
    });
  }
  return NextResponse.json({ success: true });
}
`);

w('src/app/api/quotes/[id]/decline/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { reason, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({ where: { id: params.id }, include: { event: true } });
  if (!quote || quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.quote.update({ where: { id: params.id }, data: { status: 'DECLINED', declinedAt: new Date(), declineReason: reason || null } });
  return NextResponse.json({ success: true });
}
`);

// ── 5. Gallery R2 upload API ──────────────────────────────────────────────────
w('src/app/api/gallery/[id]/upload/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { getPresignedUploadUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { fileName, contentType } = await req.json();
  const key = 'galleries/' + session.tenantId + '/' + params.id + '/' + Date.now() + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  const publicUrl = (process.env.R2_PUBLIC_URL || '') + '/' + key;
  return NextResponse.json({ uploadUrl, key, publicUrl });
}
`);

w('src/app/api/gallery/[id]/assets/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { url, fileName, fileSize, mimeType } = await req.json();
  const asset = await prisma.galleryAsset.create({
    data: { galleryId: params.id, tenantId: session.tenantId, url, originalFileName: fileName, fileSizeBytes: fileSize || 0, mimeType: mimeType || 'image/jpeg', assetType: 'PHOTO', approvalStatus: 'APPROVED' },
  });
  return NextResponse.json(asset, { status: 201 });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const assets = await prisma.galleryAsset.findMany({ where: { galleryId: params.id, tenantId: session.tenantId }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(assets);
}
`);

// ── 6. Archive API ────────────────────────────────────────────────────────────
w('src/app/api/events/[id]/archive/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.event.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId, status: 'ARCHIVED' } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.event.update({ where: { id: params.id }, data: { status: 'COMPLETED' } });
  return NextResponse.json(updated);
}
`);

// ── 7. Invoice new page with line items ───────────────────────────────────────
w('src/app/(tenant)/invoices/new/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Suspense } from 'react';

interface LineItem { description: string; quantity: number; unitPrice: string; }

function InvoiceNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const eventId = params.get('eventId');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(eventId || '');
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: '' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'full'|'deposit'>('full');
  const [depositPercent, setDepositPercent] = useState('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/events').then(r=>r.json()).then(setEvents); }, []);

  function addItem() { setItems(i => [...i, { description:'', quantity:1, unitPrice:'' }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_,j) => j !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, val: string|number) {
    setItems(prev => prev.map((item, j) => j === idx ? { ...item, [field]: val } : item));
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unitPrice) || 0)), 0);
  const taxAmt = subtotal * (parseFloat(taxRate) / 100);
  const total = subtotal + taxAmt;
  const depositAmt = paymentType === 'deposit' ? total * (parseFloat(depositPercent) / 100) : total;

  const fmt = (n: number) => '$' + n.toFixed(2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) { setError('Please select an event'); return; }
    setLoading(true); setError('');
    const lineItems = items.filter(i => i.description.trim()).map(i => ({
      description: i.description,
      quantity: i.quantity,
      unitCents: Math.round((parseFloat(i.unitPrice)||0)*100),
      totalCents: Math.round(i.quantity * (parseFloat(i.unitPrice)||0) * 100),
    }));
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: selectedEvent, lineItems, taxRatePercent: parseFloat(taxRate)||0, dueDate: dueDate||null, notes: notes||null, paymentType, depositPercent: parseFloat(depositPercent)||100 }),
    });
    const data = await res.json();
    if (res.ok) router.push('/invoices/' + data.id);
    else { setError(data.error || 'Failed'); setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Invoice" />
      <div className="p-8 max-w-3xl space-y-6">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Event</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.client?.firstName} {ev.client?.lastName}</option>)}
              </Select>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Item</Button></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
                <div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Unit Price</div><div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(i,'description',e.target.value)} placeholder="Description"/></div>
                  <div className="col-span-2"><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i,'quantity',parseFloat(e.target.value)||1)}/></div>
                  <div className="col-span-3"><Input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(i,'unitPrice',e.target.value)} placeholder="0.00"/></div>
                  <div className="col-span-1">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}</div>
                </div>
              ))}
              <div className="border-t pt-4 space-y-1 text-right text-sm">
                <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
                <div className="flex items-center justify-end gap-2"><span className="text-gray-500">Tax:</span><Input type="number" step="0.1" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-20 h-7 text-right text-xs"/><span className="text-gray-400 text-xs">%</span><span className="text-gray-500 w-20 text-right">{fmt(taxAmt)}</span></div>
                <p className="text-xl font-bold">Total: {fmt(total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payment Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                {[['full','Full Payment'],['deposit','Deposit + Balance']].map(([v,l]) => (
                  <label key={v} className={'flex items-center gap-2 cursor-pointer px-4 py-3 rounded-xl border-2 transition-colors ' + (paymentType===v ? 'border-brand bg-brand-surface' : 'border-gray-200')}>
                    <input type="radio" value={v} checked={paymentType===v} onChange={() => setPaymentType(v as any)} className="sr-only"/>
                    <span className="text-sm font-medium">{l}</span>
                  </label>
                ))}
              </div>
              {paymentType === 'deposit' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Deposit Percentage</label>
                    <div className="flex items-center gap-2"><Input type="number" min="1" max="99" value={depositPercent} onChange={e => setDepositPercent(e.target.value)} className="w-24"/><span className="text-sm text-gray-500">% = {fmt(depositAmt)} due now</span></div></div>
                  <div><p className="text-sm font-medium text-gray-700 mb-1">Balance Due</p><p className="text-sm text-gray-600 mt-2">{fmt(total - depositAmt)} — due before event</p></div>
                </div>
              )}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Payment notes..."/></div>
            </CardContent>
          </Card>
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Invoice'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function InvoiceNewPage() {
  return <Suspense><InvoiceNewForm/></Suspense>;
}
`);

// ── 8. Invoice API update to handle line items + payment schedule ─────────────
w('src/app/api/invoices/route.ts', `export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const invoices = await prisma.invoice.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { eventId, lineItems, taxRatePercent, dueDate, notes, paymentType, depositPercent } = body;
  if (!eventId) return NextResponse.json({ error: 'Event required' }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const count = await prisma.invoice.count({ where: { tenantId: session.tenantId } });
  const invoiceNumber = 'INV-' + String(count + 1).padStart(4, '0');
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const total = subtotal + tax;
  const deposit = paymentType === 'deposit' ? Math.round(total * ((depositPercent||50)/100)) : total;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: session.tenantId, eventId, clientId: event.clientId,
      invoiceNumber, subtotalCents: subtotal, taxAmountCents: tax, totalCents: total,
      balanceDueCents: total, amountPaidCents: 0,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || null, status: 'DRAFT',
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity||1, unitCents: li.unitCents||0, totalCents: li.totalCents||0, sortOrder: i })) },
      ...(paymentType === 'deposit' ? {
        milestones: { create: [
          { tenantId: session.tenantId, label: 'Deposit', amountCents: deposit, dueDate: dueDate ? new Date(dueDate) : new Date() },
          { tenantId: session.tenantId, label: 'Balance', amountCents: total - deposit, dueDate: dueDate ? new Date(dueDate) : new Date() },
        ]},
      } : {}),
    },
    include: { lineItems: true, milestones: true },
  });
  return NextResponse.json(invoice, { status: 201 });
}
`);

// ── 9. Update Sidebar to include Quotes ───────────────────────────────────────
const sidebarPath = path.join(ROOT, 'src/components/layout/Sidebar.tsx');
let sidebar = fs.readFileSync(sidebarPath, 'utf8');
if (!sidebar.includes("href: '/quotes'")) {
  sidebar = sidebar.replace(
    "{ href: '/invoices', label: 'Invoices', icon: Receipt },",
    "{ href: '/quotes', label: 'Quotes', icon: FileText },\n  { href: '/invoices', label: 'Invoices', icon: Receipt },"
  );
  fs.writeFileSync(sidebarPath, sidebar, 'utf8');
  process.stdout.write('  ✓ Sidebar.tsx (added Quotes)\n');
}

// ── 10. New quote page ────────────────────────────────────────────────────────
w('src/app/(tenant)/quotes/new/page.tsx', `'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { Suspense } from 'react';

interface LineItem { description: string; quantity: number; unitPrice: string; }

function QuoteNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [events, setEvents] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(params.get('eventId') || '');
  const [items, setItems] = useState<LineItem[]>([{ description:'', quantity:1, unitPrice:'' }]);
  const [taxRate, setTaxRate] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('This quote is valid for 14 days. A signed contract and deposit are required to secure your date.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/events').then(r=>r.json()).then(setEvents);
    fetch('/api/settings/packages').then(r=>r.json()).then(setPackages);
  }, []);

  function addItem() { setItems(i => [...i, { description:'', quantity:1, unitPrice:'' }]); }
  function removeItem(idx: number) { setItems(i => i.filter((_,j) => j !== idx)); }
  function updateItem(idx: number, field: keyof LineItem, val: string|number) {
    setItems(prev => prev.map((item, j) => j === idx ? { ...item, [field]: val } : item));
  }
  function addPackage(pkg: any) {
    setItems(i => [...i, { description: pkg.name + (pkg.description ? ' — ' + pkg.description : ''), quantity: 1, unitPrice: (pkg.priceCents/100).toFixed(2) }]);
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * (parseFloat(i.unitPrice)||0)), 0);
  const taxAmt = subtotal * (parseFloat(taxRate)||0) / 100;
  const disc = parseFloat(discount)||0;
  const total = subtotal + taxAmt - disc;
  const fmt = (n: number) => '$' + n.toFixed(2);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEvent) { setError('Please select an event'); return; }
    setLoading(true); setError('');
    const lineItems = items.filter(i => i.description.trim()).map(i => ({
      description: i.description, quantity: i.quantity,
      unitCents: Math.round((parseFloat(i.unitPrice)||0)*100),
      totalCents: Math.round(i.quantity*(parseFloat(i.unitPrice)||0)*100),
    }));
    const res = await fetch('/api/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: selectedEvent, lineItems, taxRatePercent: parseFloat(taxRate)||0, discountCents: Math.round(disc*100), validUntil: validUntil||null, notes: notes||null, terms: terms||null }),
    });
    const data = await res.json();
    if (res.ok) router.push('/quotes/' + data.id);
    else { setError(data.error || 'Failed'); setLoading(false); }
  }

  return (
    <>
      <TopBar title="New Quote" />
      <div className="p-8 max-w-3xl space-y-6">
        <form onSubmit={submit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Event</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                <option value="">— Select Event —</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title} — {ev.client?.firstName} {ev.client?.lastName}</option>)}
              </Select>
            </CardContent>
          </Card>
          {packages.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Quick Add from Packages</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {packages.map(p => (
                  <button key={p.id} type="button" onClick={() => addPackage(p)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-brand-surface hover:border-brand text-sm transition-colors">
                    <span>{p.name}</span><span className="text-brand font-semibold">${(p.priceCents/100).toFixed(0)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Line Items</CardTitle><Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1"/>Add Row</Button></div></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-1">
                <div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-3">Unit Price</div><div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-6"><Input value={item.description} onChange={e => updateItem(i,'description',e.target.value)} placeholder="e.g. 4-Hour Photo Booth Package"/></div>
                  <div className="col-span-2"><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i,'quantity',parseFloat(e.target.value)||1)}/></div>
                  <div className="col-span-3"><Input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(i,'unitPrice',e.target.value)} placeholder="0.00"/></div>
                  <div className="col-span-1 text-right text-xs text-gray-500">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}</div>
                </div>
              ))}
              <div className="border-t pt-4 space-y-2 text-right text-sm">
                <p className="text-gray-500">Subtotal: {fmt(subtotal)}</p>
                <div className="flex items-center justify-end gap-2 text-gray-500">
                  Tax: <Input type="number" step="0.1" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="w-20 h-7 text-right text-xs"/> %
                  <span className="w-20 text-right">{fmt(taxAmt)}</span>
                </div>
                <div className="flex items-center justify-end gap-2 text-gray-500">
                  Discount: $<Input type="number" step="0.01" min="0" value={discount} onChange={e => setDiscount(e.target.value)} className="w-24 h-7 text-right text-xs"/>
                </div>
                <p className="text-xl font-bold text-brand">Total: {fmt(total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label><Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}/></div>
              <div/>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Notes to Client</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Additional notes..."/></div>
              <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Terms</label><textarea value={terms} onChange={e => setTerms(e.target.value)} className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-brand"/></div>
            </CardContent>
          </Card>
          {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-4 py-3">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Quote'}</Button>
          </div>
        </form>
      </div>
    </>
  );
}
export default function QuoteNewPage() { return <Suspense><QuoteNewForm/></Suspense>; }
`);

// ── 11. Quote detail page ─────────────────────────────────────────────────────
w('src/app/(tenant)/quotes/[id]/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send, Edit2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import QuoteActions from './QuoteActions';

const QC: Record<string,any> = { DRAFT:'default', SENT:'info', VIEWED:'warning', ACCEPTED:'success', DECLINED:'danger', EXPIRED:'default' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'usd' }).format(c/100);

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quote) notFound();
  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL||'') + '/portal/' + quote.event.portalToken + '?tab=quote';
  return (
    <>
      <TopBar title={'Quote ' + quote.quoteNumber}/>
      <div className="p-8 max-w-4xl space-y-6">
        <Link href="/quotes" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Quotes</Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{quote.quoteNumber}</h2>
            <Badge variant={QC[quote.status]}>{quote.status}</Badge>
          </div>
          <QuoteActions quoteId={quote.id} status={quote.status} portalUrl={portalUrl}/>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader><CardTitle>Quote Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-gray-500">Event:</span> <span className="font-medium">{quote.event.title}</span></p>
              <p><span className="text-gray-500">Date:</span> <span className="font-medium">{format(quote.event.eventDate,'EEEE, MMMM d, yyyy')}</span></p>
              {quote.validUntil && <p><span className="text-gray-500">Valid until:</span> <span className="font-medium">{format(quote.validUntil,'MMM d, yyyy')}</span></p>}
              {quote.sentAt && <p><span className="text-gray-500">Sent:</span> <span className="font-medium">{format(quote.sentAt,'MMM d, yyyy h:mm a')}</span></p>}
              {quote.acceptedAt && <p><span className="text-gray-500">Accepted:</span> <span className="font-medium text-green-600">{format(quote.acceptedAt,'MMM d, yyyy h:mm a')}</span></p>}
              {quote.declinedAt && <p><span className="text-gray-500">Declined:</span> <span className="font-medium text-red-600">{format(quote.declinedAt,'MMM d, yyyy')}</span></p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-semibold">{quote.client.firstName} {quote.client.lastName}</p>
              <p className="text-gray-600">{quote.client.email}</p>
              {quote.client.phone && <p className="text-gray-600">{quote.client.phone}</p>}
              <div className="pt-2 border-t mt-2">
                <a href={portalUrl} target="_blank" className="text-brand hover:underline text-xs">View Client Portal →</a>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Description</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Unit Price</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Total</th>
              </tr></thead>
              <tbody>
                {quote.lineItems.map(li => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="px-6 py-3">{li.description}</td>
                    <td className="px-6 py-3 text-right">{li.quantity}</td>
                    <td className="px-6 py-3 text-right">{fmt(li.unitCents)}</td>
                    <td className="px-6 py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-6 py-4 border-t text-right space-y-1 text-sm">
              <p className="text-gray-500">Subtotal: {fmt(quote.subtotalCents)}</p>
              {quote.taxAmountCents > 0 && <p className="text-gray-500">Tax ({quote.taxRatePercent}%): {fmt(quote.taxAmountCents)}</p>}
              {quote.discountCents > 0 && <p className="text-green-600">Discount: -{fmt(quote.discountCents)}</p>}
              <p className="text-2xl font-bold text-brand">Total: {fmt(quote.totalCents)}</p>
            </div>
          </CardContent>
        </Card>
        {quote.notes && <Card><CardContent className="pt-4"><p className="text-sm font-medium text-gray-700 mb-1">Notes</p><p className="text-sm text-gray-600">{quote.notes}</p></CardContent></Card>}
        {quote.terms && <Card><CardContent className="pt-4"><p className="text-sm font-medium text-gray-700 mb-1">Terms</p><p className="text-sm text-gray-600">{quote.terms}</p></CardContent></Card>}
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/quotes/[id]/QuoteActions.tsx', `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Send, Edit2, ExternalLink, Archive } from 'lucide-react';
import Link from 'next/link';

export default function QuoteActions({ quoteId, status, portalUrl }: { quoteId: string; status: string; portalUrl: string }) {
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function sendQuote() {
    setSending(true);
    await fetch('/api/quotes/' + quoteId + '/send', { method: 'POST' });
    router.refresh(); setSending(false);
  }

  return (
    <div className="flex gap-2">
      {status === 'DRAFT' && (
        <>
          <Link href={'/quotes/' + quoteId + '/edit'}><Button variant="outline" size="sm"><Edit2 className="w-4 h-4 mr-1"/>Edit</Button></Link>
          <Button size="sm" onClick={sendQuote} disabled={sending}><Send className="w-4 h-4 mr-1"/>{sending ? 'Sending...' : 'Send to Client'}</Button>
        </>
      )}
      {(status === 'SENT' || status === 'VIEWED') && (
        <a href={portalUrl} target="_blank"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1"/>View Portal</Button></a>
      )}
      {status === 'ACCEPTED' && (
        <Link href={'/contracts/new?quoteId=' + quoteId}><Button variant="outline" size="sm">View Contract →</Button></Link>
      )}
    </div>
  );
}
`);

// ── 12. Update events list to show/filter archived ────────────────────────────
w('src/app/(tenant)/events/page.tsx', `import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Calendar, ArrowRight, Archive } from 'lucide-react';
import { format } from 'date-fns';
import ArchiveToggle from './ArchiveToggle';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger', ARCHIVED:'default' };

export default async function EventsPage({ searchParams }: { searchParams: { archived?: string } }) {
  const session = await requireTenantSession();
  const showArchived = searchParams.archived === '1';
  const events = await prisma.event.findMany({
    where: { tenantId: session.tenantId, status: showArchived ? 'ARCHIVED' : { not: 'ARCHIVED' } },
    include: { client: true }, orderBy: { eventDate: 'desc' }, take: 100,
  });
  return (
    <>
      <TopBar title="Events" />
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <Link href="/events"><Button variant={!showArchived ? 'default' : 'outline'} size="sm">Active</Button></Link>
            <Link href="/events?archived=1"><Button variant={showArchived ? 'default' : 'outline'} size="sm"><Archive className="w-3 h-3 mr-1"/>Archived</Button></Link>
          </div>
          {!showArchived && <Link href="/events/new"><Button><Plus className="w-4 h-4 mr-2"/>New Event</Button></Link>}
        </div>
        <Card><CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30"/>
              <p>{showArchived ? 'No archived events.' : 'No events yet.'}</p>
              {!showArchived && <Link href="/events/new"><Button className="mt-4">Create First Event</Button></Link>}
            </div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3"></th>
              </tr></thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold">{ev.title}</p><p className="text-xs text-gray-400">{ev.venueName ?? ''}</p></td>
                    <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{format(ev.eventDate,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <ArchiveToggle eventId={ev.id} isArchived={ev.status === 'ARCHIVED'}/>
                      <Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
`);

w('src/app/(tenant)/events/ArchiveToggle.tsx', `'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore } from 'lucide-react';

export default function ArchiveToggle({ eventId, isArchived }: { eventId: string; isArchived: boolean }) {
  const router = useRouter();
  async function toggle() {
    if (isArchived) {
      await fetch('/api/events/' + eventId + '/archive', { method: 'DELETE' });
    } else {
      if (!confirm('Archive this event? It will be moved to the archive and hidden from the main list.')) return;
      await fetch('/api/events/' + eventId + '/archive', { method: 'POST' });
    }
    router.refresh();
  }
  return (
    <Button variant="ghost" size="sm" onClick={toggle} title={isArchived ? 'Unarchive' : 'Archive'} className="text-gray-400 hover:text-gray-600">
      {isArchived ? <ArchiveRestore className="w-4 h-4"/> : <Archive className="w-4 h-4"/>}
    </Button>
  );
}
`);

// ── 13. Package.json additions ────────────────────────────────────────────────
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let changed = false;
if (!pkg.dependencies['@aws-sdk/client-s3']) { pkg.dependencies['@aws-sdk/client-s3'] = '^3.600.0'; changed = true; }
if (!pkg.dependencies['@aws-sdk/s3-request-presigner']) { pkg.dependencies['@aws-sdk/s3-request-presigner'] = '^3.600.0'; changed = true; }
if (changed) { fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8'); process.stdout.write('  ✓ package.json (added AWS S3 SDK for R2)\n'); }

console.log('\n✅ Build v2 complete!\n');
console.log('Next steps:');
console.log('  1. npm install');
console.log('  2. npm run db');
console.log('  3. Add R2 env vars to Vercel:');
console.log('     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
console.log('     R2_BUCKET_NAME=boothgen-gallery, R2_PUBLIC_URL');
console.log('  4. git add . && git commit -m "Build v2" && git push\n');
