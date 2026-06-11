export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
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
    where: { id: params.id, clientToken: clientToken },
    include: { tenant: { include: { branding: true } }, client: true },
  });
  if (!contract) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already signed' }, { status: 400 });
  const now = new Date();
  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      clientSignatureData: signatureDataUrl,
      clientSignedAt: now,
      clientIpAddress: ip,
      status: contract.hostSignedAt ? 'FULLY_EXECUTED' : 'CLIENT_SIGNED',
          },
  });
  return NextResponse.json({ success: true, status: updated.status });
}
