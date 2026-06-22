export const dynamic = 'force-dynamic';
import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { LeadDetail } from './LeadDetail';

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const lead = await prisma.leadSubmission.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { messages: { orderBy: { sentAt: 'asc' } } },
  });
  if (!lead) notFound();

  const serialized = {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    eventDate: lead.eventDate?.toISOString() ?? null,
    eventType: lead.eventType,
    startTime: lead.startTime,
    endTime: lead.endTime,
    venueName: lead.venueName,
    venueAddress: lead.venueAddress,
    venueCity: lead.venueCity,
    venueState: lead.venueState,
    venuePostalCode: lead.venuePostalCode,
    guestCount: lead.guestCount,
    message: lead.message,
    notes: lead.notes,
    status: lead.status,
    convertedToEventId: lead.convertedToEventId,
    createdAt: lead.createdAt.toISOString(),
    messages: lead.messages.map(m => ({
      id: m.id,
      direction: m.direction,
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      sentAt: m.sentAt.toISOString(),
    })),
  };

  return (
    <>
      <TopBar title="Inquiry Detail" />
      <LeadDetail lead={serialized} />
    </>
  );
}
