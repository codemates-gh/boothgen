export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

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
  const event = await prisma.event.create({
    data: {
      tenantId: session.tenantId, clientId: client.id,
      title, status: status || 'LEAD', eventDate: new Date(eventDate),
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
  return NextResponse.json(event, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' } });
  return NextResponse.json(events);
}
