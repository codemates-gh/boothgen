export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const designs = await prisma.templateDesign.findMany({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { version: 'desc' },
  });
  return NextResponse.json(designs);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileUrl, filename } = await req.json();
  if (!fileUrl || !filename) return NextResponse.json({ error: 'fileUrl and filename are required' }, { status: 400 });

  const latest = await prisma.templateDesign.findFirst({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;

  const design = await prisma.templateDesign.create({
    data: { tenantId: session.tenantId, eventId: params.id, fileUrl, filename, version, status: 'DRAFT' },
  });
  return NextResponse.json(design, { status: 201 });
}
