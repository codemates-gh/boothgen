import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { generateLockedContractPdf } from '@/lib/contracts/pdf-generator';

const Schema = z.object({ signatureDataUrl: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).max(500000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 422 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, tenant: { include: { branding: true } } } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already executed', pdfUrl: contract.pdfUrl }, { status: 409 });
  if (contract.hostSignedAt) return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  const now = new Date();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const newStatus = contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED';
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  await prisma.contract.update({ where: { id: contract.id }, data: { hostSignatureData: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, hostSignedByUserId: user?.id, status: newStatus } });
  let pdfUrl: string | undefined;
  if (newStatus === 'FULLY_EXECUTED' && contract.clientSignedAt && contract.clientSignatureData) {
    try {
      const b = contract.tenant.branding;
      const r = await generateLockedContractPdf({ contractId: contract.id, tenantId: contract.tenantId, title: contract.title, renderedContent: contract.renderedContent, clientFullName: contract.client.firstName + ' ' + contract.client.lastName, clientEmail: contract.client.email, clientSignatureDataUrl: contract.clientSignatureData, clientSignedAt: contract.clientSignedAt, clientIpAddress: contract.clientIpAddress ?? 'unknown', hostFullName: user?.name ?? 'Authorized Representative', hostEmail: user?.email ?? '', hostSignatureDataUrl: parsed.data.signatureDataUrl, hostSignedAt: now, hostIpAddress: ip, branding: { companyName: b?.companyName ?? contract.tenant.name, primaryColor: b?.primaryColor ?? '#F97316', logoUrl: b?.logoUrl ?? undefined } });
      pdfUrl = r.pdfUrl;
      await prisma.contract.update({ where: { id: contract.id }, data: { pdfUrl: r.pdfUrl, contentHash: r.contentHash, pdfLockedAt: now } });
    } catch (e) { console.error('[PDF]', e); }
  }
  return NextResponse.json({ success: true, status: newStatus, pdfUrl: pdfUrl ?? null });
}
