export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lead = await prisma.leadSubmission.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lead.convertedToEventId) {
    return NextResponse.json({ eventId: lead.convertedToEventId });
  }

  const client = await prisma.client.upsert({
    where: { tenantId_email: { tenantId: session.tenantId, email: lead.email } },
    update: { firstName: lead.firstName, lastName: lead.lastName, phone: lead.phone ?? null },
    create: { tenantId: session.tenantId, firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone ?? null },
  });

  const eventTitle = `${lead.firstName} ${lead.lastName}${lead.eventType ? ' — ' + lead.eventType : ''}`;
  const dateStr = lead.eventDate ? lead.eventDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const event = await prisma.event.create({
    data: {
      tenantId: session.tenantId,
      clientId: client.id,
      title: eventTitle,
      status: 'LEAD',
      eventDate: lead.eventDate ?? new Date(),
      startTime: lead.startTime ? new Date(`${dateStr}T${lead.startTime}`) : null,
      endTime: lead.endTime ? new Date(`${dateStr}T${lead.endTime}`) : null,
      venueName: lead.venueName ?? null,
      venueAddress: lead.venueAddress ?? null,
      venueCity: lead.venueCity ?? null,
      venueState: lead.venueState ?? null,
      venuePostalCode: lead.venuePostalCode ?? null,
      guestCount: lead.guestCount ?? null,
      internalNotes: lead.notes ?? null,
    },
  });

  await prisma.leadSubmission.update({
    where: { id: params.id },
    data: { convertedToEventId: event.id, convertedAt: new Date(), status: 'CONVERTED' },
  });

  inngest.send({ name: 'lead/created', data: { tenantId: session.tenantId, eventId: event.id } }).catch(() => {});

  return NextResponse.json({ eventId: event.id }, { status: 201 });
}
