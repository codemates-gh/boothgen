#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
function w(p, c) {
  const full = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, c, 'utf8');
  process.stdout.write('  \u2713 ' + p + '\n');
}
console.log('\n\ud83d\udd27 Fixing build errors...\n');

// ── 1. Fix sign/client route (bad regex) ─────────────────────────────────────
w('src/app/api/contracts/[id]/sign/client/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { z } from 'zod';

const Schema = z.object({
  clientToken: z.string().min(1).max(256),
  signatureDataUrl: z.string().min(1),
  signerName: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { clientToken, signatureDataUrl, signerName } = parsed.data;
  const contract = await prisma.contract.findFirst({
    where: { id: params.id, clientSignToken: clientToken },
    include: { tenant: { include: { branding: true } }, client: true },
  });
  if (!contract) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  const now = new Date();
  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      clientSignatureDataUrl: signatureDataUrl,
      clientSignedAt: now,
      clientIpAddress: ip,
      clientSignerName: signerName,
      status: contract.hostSignedAt ? 'FULLY_EXECUTED' : 'CLIENT_SIGNED',
      fullyExecutedAt: contract.hostSignedAt ? now : null,
    },
  });
  return NextResponse.json({ success: true, status: updated.status });
}
`);

// ── 2. Fix sign/host route ────────────────────────────────────────────────────
w('src/app/api/contracts/[id]/sign/host/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { z } from 'zod';

const Schema = z.object({
  signatureDataUrl: z.string().min(1),
  signerName: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { signatureDataUrl, signerName } = parsed.data;
  const contract = await prisma.contract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const now = new Date();
  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      hostSignatureDataUrl: signatureDataUrl,
      hostSignedAt: now,
      hostIpAddress: ip,
      hostSignerName: signerName,
      status: contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED',
      fullyExecutedAt: contract.clientSignedAt ? now : null,
    },
  });
  return NextResponse.json({ success: true, status: updated.status });
}
`);

// ── 3. Fix public leads route ─────────────────────────────────────────────────
w('src/app/api/public/[tenantSlug]/leads/route.ts', `import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function POST(req: NextRequest, { params }: { params: { tenantSlug: string } }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, include: { apiKeys: { where: { isActive: true }, take: 1 } } });
  if (!tenant || tenant.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: cors() });
  }
  const body = await req.json();
  const { firstName, lastName, email, phone, eventDate, eventType, guestCount, message, referrerUrl } = body;
  if (!firstName || !lastName || !email || !eventDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: cors() });
  }
  const apiKeyId = tenant.apiKeys[0]?.id ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const recent = await prisma.leadSubmission.findFirst({ where: { tenantId: tenant.id, email: email.toLowerCase(), createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
  if (recent) {
    return NextResponse.json({ success: true, message: 'Inquiry received.' }, { status: 200, headers: cors() });
  }
  const lead = await prisma.leadSubmission.create({
    data: {
      tenantId: tenant.id,
      apiKeyId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || null,
      eventDate: new Date(eventDate),
      eventType: eventType || null,
      guestCount: guestCount ? parseInt(guestCount) : null,
      message: message || null,
      referrerUrl: referrerUrl || null,
      ipAddress: ip,
    },
  });
  try {
    await prisma.client.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase().trim() } },
      update: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone || null },
      create: { tenantId: tenant.id, firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase().trim(), phone: phone || null },
    });
  } catch {}
  return NextResponse.json({ success: true, message: "Inquiry received. We'll be in touch shortly." }, { status: 201, headers: cors() });
}
`);

// ── 4. Fix webhooks/clerk (stub - svix missing, not needed) ──────────────────
w('src/app/api/webhooks/clerk/route.ts', `import { NextResponse } from 'next/server';
// Clerk webhooks are no longer used — stub to prevent build errors
export async function POST() {
  return NextResponse.json({ received: true });
}
`);

console.log('\n\u2705 Done! Run: git add . && git commit -m "Fix build errors" && git push\n');
