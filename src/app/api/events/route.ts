export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { triggerAutomation, scheduleEventDateAutomations } from '@/lib/inngest/trigger';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { firstName, lastName, email, phone, company, clientId, title, eventDate, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    packageName, guestCount, internalNotes, status, estimatedValueCents } = body;
  if (!title || !eventDate) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  let client;
  if (clientId) {
    client = await prisma.client.findFirst({ where: { id: clientId, tenantId: session.tenantId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  } else {
    if (!firstName || !lastName || !email)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    client = await prisma.client.upsert({
      where: { tenantId_email: { tenantId: session.tenantId, email } },
      update: { firstName, lastName, phone: phone || null, company: company || null },
      create: { tenantId: session.tenantId, firstName, lastName, email, phone: phone || null, company: company || null },
    });
  }
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
      estimatedValueCents: estimatedValueCents != null ? Math.round(parseFloat(estimatedValueCents) * 100) : null,
      gallery: { create: { tenantId: session.tenantId, title: title + ' Gallery' } },
    },
  });

  // Fire automation triggers directly — bypass Inngest for reliability
  if (eventStatus === 'LEAD') {
    triggerAutomation({ tenantId: session.tenantId, eventId: event.id, trigger: 'LEAD_CREATED' }).catch(() => {});
  } else if (eventStatus === 'BOOKED') {
    triggerAutomation({ tenantId: session.tenantId, eventId: event.id, trigger: 'BOOKING_CONFIRMED' }).catch(() => {});
    scheduleEventDateAutomations({ tenantId: session.tenantId, eventId: event.id, eventDate: event.eventDate }).catch(() => {});
  }

  return NextResponse.json(event, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
