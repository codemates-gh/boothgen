export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendDesignDecisionEmail } from '@/lib/email/send';
import { z } from 'zod';

const Schema = z.object({ portalToken: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const design = await prisma.templateDesign.findUnique({
    where: { id: params.id },
    include: {
      event: { include: { client: true } },
      tenant: {
        include: {
          branding: { select: { companyName: true, replyToEmail: true } },
          memberships: { where: { role: 'HOST_ADMIN', status: 'ACTIVE' }, include: { user: { select: { email: true } } } },
        },
      },
    },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (design.event.portalToken !== parsed.data.portalToken) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  if (design.status === 'APPROVED') return NextResponse.json({ error: 'Already approved' }, { status: 400 });
  if (design.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is not pending approval' }, { status: 400 });

  await prisma.templateDesign.update({
    where: { id: params.id },
    data: { status: 'APPROVED', approvedAt: new Date() },
  });

  // Notify all host admins directly
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  const adminEmails = design.tenant.memberships.map(m => m.user?.email).filter((e): e is string => Boolean(e));
  const replyTo = design.tenant.branding?.replyToEmail;
  const recipients = replyTo ? [replyTo, ...adminEmails.filter(e => e !== replyTo)] : adminEmails;
  recipients.forEach(to =>
    sendDesignDecisionEmail({
      to, decision: 'approved', version: design.version,
      clientName: design.event.client.firstName + ' ' + design.event.client.lastName,
      eventTitle: design.event.title,
      designUrl: appUrl + '/events/' + design.eventId + '/designs',
    }).catch(e => console.error('[design-approve] host email error:', e))
  );

  return NextResponse.json({ success: true, status: 'APPROVED' });
}
