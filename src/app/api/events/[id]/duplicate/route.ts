export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

// Copy an event as a new Lead for the same client: venue, times, package, guest count, estimated value.
// Quotes, invoices, contracts, notes, checklist, photos and Genie setup aren't copied, and no automations run
// (the client isn't emailed); the host sets the new date on the edit page.
export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const e = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const title = `${e.title} (copy)`;
  const copy = await prisma.event.create({
    data: {
      tenantId: e.tenantId, clientId: e.clientId, title, status: 'LEAD',
      eventDate: e.eventDate, setupTime: e.setupTime, startTime: e.startTime, endTime: e.endTime,
      venueName: e.venueName, venueAddress: e.venueAddress, venueCity: e.venueCity, venueState: e.venueState,
      venuePostalCode: e.venuePostalCode, packageName: e.packageName, packageNotes: e.packageNotes,
      guestCount: e.guestCount, estimatedValueCents: e.estimatedValueCents, internalNotes: e.internalNotes,
      gallery: { create: { tenantId: e.tenantId, title: title + ' Gallery' } },
    },
    select: { id: true },
  });
  return NextResponse.json(copy, { status: 201 });
}
