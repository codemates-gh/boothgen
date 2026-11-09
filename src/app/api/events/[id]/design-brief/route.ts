export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const brief = await prisma.eventDesignBrief.findUnique({
    where: { eventId: params.id },
    include: { template: true },
  });
  return NextResponse.json(brief ?? null);
}

// POST: operator enables the design brief for this event (creates empty brief)
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const brief = await prisma.eventDesignBrief.upsert({
    where: { eventId: params.id },
    create: { tenantId: session.tenantId, eventId: params.id },
    update: {},
    include: { template: true },
  });
  return NextResponse.json(brief);
}

// PATCH: operator updates status (IN_DESIGN, APPROVED) or deletes brief
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const brief = await prisma.eventDesignBrief.findFirst({ where: { eventId: params.id, tenantId: session.tenantId } });
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { status } = await req.json();
  const updated = await prisma.eventDesignBrief.update({
    where: { id: brief.id },
    data: { status },
    include: { template: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const brief = await prisma.eventDesignBrief.findFirst({ where: { eventId: params.id, tenantId: session.tenantId } });
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.eventDesignBrief.delete({ where: { id: brief.id } });
  return NextResponse.json({ ok: true });
}
