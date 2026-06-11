import { NextRequest, NextResponse } from 'next/server';
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
      hostSignatureData: signatureDataUrl,
      hostSignedAt: now,
      hostIpAddress: ip,
      hostSignerName: signerName,
      status: contract.clientSignedAt ? 'FULLY_EXECUTED' : 'HOST_SIGNED',
      fullyExecutedAt: contract.clientSignedAt ? now : null,
    },
  });
  return NextResponse.json({ success: true, status: updated.status });
}
