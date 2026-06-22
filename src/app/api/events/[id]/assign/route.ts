export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendEventAssignmentEmail } from '@/lib/email/send';
import { format } from 'date-fns';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, tenant: { include: { branding: { select: { companyName: true } } } } },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { userId } = await req.json();

  // Validate the user is an active member of this tenant
  if (userId) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: session.tenantId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'User is not an active team member' }, { status: 400 });
    }
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: { assignedToUserId: userId ?? null },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  // Send notification email when assigning (not when unassigning)
  if (userId && updated.assignedTo) {
    const companyName = event.tenant.branding?.companyName ?? event.tenant.name;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
    sendEventAssignmentEmail({
      to: updated.assignedTo.email,
      memberName: updated.assignedTo.name,
      companyName,
      eventTitle: event.title,
      clientName: `${event.client.firstName} ${event.client.lastName}`,
      eventDate: format(event.eventDate, 'EEEE, MMMM d, yyyy'),
      eventUrl: `${appUrl}/events/${event.id}`,
      from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
    }).catch(e => console.error('[event/assign] notification email error:', e));
  }

  return NextResponse.json(updated);
}
