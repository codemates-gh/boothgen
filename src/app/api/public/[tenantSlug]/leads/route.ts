
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
  return NextResponse.json({ success: true, message: 'Inquiry received. We'll be in touch shortly.' }, { status: 201, headers: cors() });
}

export async function generateApiKey(tenantId: string, name: string) {
  const raw = 'pb_live_' + randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  const k = await prisma.tenantApiKey.create({ data: { tenantId, name, keyHash: hash, prefix: raw.slice(0, 15) } });
  return { ...k, rawKey: raw };
}
