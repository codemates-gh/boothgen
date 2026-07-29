export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const leads = await prisma.leadSubmission.findMany({
    where: { tenantId: session.tenantId, eventDate: { not: null } },
    select: { id: true, firstName: true, lastName: true, eventDate: true, eventType: true, status: true, convertedToEventId: true },
    orderBy: { eventDate: 'asc' },
  });
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { firstName, lastName, email, phone, eventDate, eventType, message, notes } = await req.json();
  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'First name, last name, and email are required' }, { status: 400 });
  }

  const lead = await prisma.leadSubmission.create({
    data: {
      tenantId: session.tenantId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      eventDate: eventDate ? new Date(eventDate) : null,
      eventType: eventType?.trim() || null,
      message: message?.trim() || null,
      notes: notes?.trim() || null,
      source: 'manual',
      status: 'NEW',
    },
  });

  return NextResponse.json(lead, { status: 201 });
}
