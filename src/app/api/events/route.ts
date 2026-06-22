export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { firstName, lastName, email, phone, title, eventDate, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    packageName, guestCount, internalNotes, status } = body;
  if (!firstName || !lastName || !email || !title || !eventDate)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  const client = await prisma.client.upsert({
    where: { tenantId_email: { tenantId: session.tenantId, email } },
    update: { firstName, lastName, phone: phone || null },
    create: { tenantId: session.tenantId, firstName, lastName, email, phone: phone || null },
  });
  const eventStatus = status || 'LEAD';
  const event = await prisma.event.create({
    data: {
      tenantId: session.tenantId, clientId: client.id,
      title, status: eventStatus, eventDate: new Date(eventDate),
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

  // Fire automation triggers
  if (eventStatus === 'LEAD') {
    inngest.send({ name: 'lead/created', data: { tenantId: session.tenantId, eventId: event.id } }).catch(() => {});
  } else if (eventStatus === 'BOOKED') {
    inngest.send({ name: 'booking/confirmed', data: { tenantId: session.tenantId, eventId: event.id, eventDate: event.eventDate.toISOString() } }).catch(() => {});
  }

  return NextResponse.json(event, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
