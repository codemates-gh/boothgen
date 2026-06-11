export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(event);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const { title, status, eventDate, startTime, endTime, venueName, venueAddress, venueCity, venueState, venuePostalCode, packageName, guestCount, internalNotes, firstName, lastName, email, phone } = body;
  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      title, status, eventDate: new Date(eventDate),
      startTime: startTime ? new Date(eventDate + 'T' + startTime) : null,
      endTime: endTime ? new Date(eventDate + 'T' + endTime) : null,
      venueName: venueName || null, venueAddress: venueAddress || null,
      venueCity: venueCity || null, venueState: venueState || null,
      venuePostalCode: venuePostalCode || null,
      packageName: packageName || null,
      guestCount: guestCount ? parseInt(guestCount) : null,
      internalNotes: internalNotes || null,
    },
  });
  if (email) {
    await prisma.client.update({ where: { id: event.clientId }, data: { firstName: firstName || undefined, lastName: lastName || undefined, email, phone: phone || null } });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.event.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
