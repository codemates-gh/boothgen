export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lead = await prisma.leadSubmission.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { firstName, lastName, email, phone, eventDate, eventType, startTime, endTime,
    venueName, venueAddress, venueCity, venueState, venuePostalCode,
    guestCount, message, notes, status } = body;

  const updated = await prisma.leadSubmission.update({
    where: { id: params.id },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(eventDate !== undefined && { eventDate: eventDate ? new Date(eventDate) : null }),
      ...(eventType !== undefined && { eventType: eventType || null }),
      ...(startTime !== undefined && { startTime: startTime || null }),
      ...(endTime !== undefined && { endTime: endTime || null }),
      ...(venueName !== undefined && { venueName: venueName || null }),
      ...(venueAddress !== undefined && { venueAddress: venueAddress || null }),
      ...(venueCity !== undefined && { venueCity: venueCity || null }),
      ...(venueState !== undefined && { venueState: venueState || null }),
      ...(venuePostalCode !== undefined && { venuePostalCode: venuePostalCode || null }),
      ...(guestCount !== undefined && { guestCount: guestCount ? parseInt(guestCount) : null }),
      ...(message !== undefined && { message: message || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(status !== undefined && { status }),
    },
  });

  return NextResponse.json(updated);
}
