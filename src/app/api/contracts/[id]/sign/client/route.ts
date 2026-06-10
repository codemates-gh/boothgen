
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { generateLockedContractPdf } from '@/lib/contracts/pdf-generator';
import { checkSigningRateLimit } from '@/lib/rate-limit';

const Schema = z.object({ clientToken: z.string().min(1).max(256), signatureDataUrl: z.string().regex(/^data:image/png;base64,[A-Za-z0-9+/]+=*$/).max(500000), hasReadAndAgreed: z.literal(true) });

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
