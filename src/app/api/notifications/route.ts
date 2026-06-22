export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([]);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const isTeamMember = session.tenantRole === 'TEAM_MEMBER';

  // For team members, scope everything to their assigned events
  let assignedEventIds: string[] | null = null;
  if (isTeamMember) {
    const assigned = await prisma.event.findMany({
      where: { tenantId: session.tenantId, assignedToUserId: session.userId },
      select: { id: true },
    });
    assignedEventIds = assigned.map(e => e.id);
  }

  const [leads, replies, bookings, payments, contracts] = await Promise.all([
    // Team members don't have access to leads
    isTeamMember ? Promise.resolve([]) : prisma.leadSubmission.findMany({
      where: { tenantId: session.tenantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    // Team members don't have access to lead replies
    isTeamMember ? Promise.resolve([]) : prisma.leadMessage.findMany({
      where: { direction: 'INBOUND', sentAt: { gte: since }, lead: { tenantId: session.tenantId } },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { sentAt: 'desc' },
      take: 5,
    }),
    prisma.event.findMany({
      where: {
        tenantId: session.tenantId,
        status: 'BOOKED',
        updatedAt: { gte: since },
        ...(assignedEventIds ? { id: { in: assignedEventIds } } : {}),
      },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: session.tenantId,
        status: 'PAID',
        updatedAt: { gte: since },
        ...(assignedEventIds ? { eventId: { in: assignedEventIds } } : {}),
      },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.contract.findMany({
      where: {
        tenantId: session.tenantId,
        status: 'FULLY_EXECUTED',
        updatedAt: { gte: since },
        ...(assignedEventIds ? { eventId: { in: assignedEventIds } } : {}),
      },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  const items: any[] = [
    ...leads.map(e => ({
      id: 'lead-' + e.id,
      type: 'lead',
      title: 'New inquiry: ' + (e.eventType || 'Photo Booth'),
      body: e.firstName + ' ' + e.lastName,
      href: `/leads/${e.id}`,
      createdAt: e.createdAt,
    })),
    ...replies.map(m => ({
      id: 'reply-' + m.id,
      type: 'reply',
      title: `${m.lead.firstName} ${m.lead.lastName} replied`,
      body: m.bodyText ? m.bodyText.slice(0, 80) : 'New message',
      href: `/leads/${m.lead.id}`,
      createdAt: m.sentAt,
    })),
    ...bookings.map(e => ({
      id: 'booking-' + e.id,
      type: 'booking',
      title: 'Event booked: ' + e.title,
      body: e.client.firstName + ' ' + e.client.lastName,
      createdAt: e.updatedAt,
    })),
    ...payments.map(inv => ({
      id: 'payment-' + inv.id,
      type: 'payment',
      title: 'Payment received: ' + inv.invoiceNumber,
      body: inv.client.firstName + ' ' + inv.client.lastName,
      createdAt: inv.updatedAt,
    })),
    ...contracts.map(c => ({
      id: 'contract-' + c.id,
      type: 'contract',
      title: 'Contract signed: ' + c.title,
      body: c.client.firstName + ' ' + c.client.lastName,
      createdAt: c.updatedAt,
    })),
  ];

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(items.slice(0, 10));
}
