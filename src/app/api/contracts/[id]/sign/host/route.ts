export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { z } from 'zod';
import { triggerAutomation } from '@/lib/inngest/trigger';

const Schema = z.object({
  signatureDataUrl: z.string().min(1),
  signerName: z.string().max(200).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      hostSignatureData: signatureDataUrl,
      hostSignedAt: now,
      hostIpAddress: ip,
      status: contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED',
          },
  });
  // Countersigning a contract the client already signed executes it: fire the "Contract Executed" automation
  if (updated.status === 'FULLY_EXECUTED' && contract.status !== 'FULLY_EXECUTED' && contract.eventId) {
    await triggerAutomation({ tenantId: contract.tenantId, eventId: contract.eventId, trigger: 'CONTRACT_FULLY_EXECUTED' })
      .catch(e => console.error('[contract/sign/host] CONTRACT_FULLY_EXECUTED automation error:', e));
  }
  return NextResponse.json({ success: true, status: updated.status });
}
