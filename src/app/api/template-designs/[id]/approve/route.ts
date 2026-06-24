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
          memberships: {
            where: { status: 'ACTIVE' },
            include: { user: { select: { email: true, name: true } } },
          },
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

  // Build recipient list: replyToEmail first, then HOST_ADMINs, then any active member as fallback
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  const replyTo = design.tenant.branding?.replyToEmail ?? null;
  const allMemberEmails = design.tenant.memberships
    .map(m => m.user?.email)
    .filter((e): e is string => Boolean(e));
  const adminEmails = design.tenant.memberships
    .filter(m => m.role === 'HOST_ADMIN')
    .map(m => m.user?.email)
    .filter((e): e is string => Boolean(e));

  // Prefer HOST_ADMIN; fall back to all active members if none found
  const baseEmails = adminEmails.length > 0 ? adminEmails : allMemberEmails;
  const recipientSet = new Set<string>(baseEmails);
  if (replyTo) recipientSet.add(replyTo);
  const recipients = Array.from(recipientSet);

  console.log('[design-approve] recipients:', recipients, '| adminEmails:', adminEmails, '| replyTo:', replyTo);

  if (recipients.length === 0) {
    console.error('[design-approve] no recipients found for tenant', design.tenantId);
  } else {
    const results = await Promise.all(
      recipients.map(to =>
        sendDesignDecisionEmail({
          to,
          decision: 'approved',
          version: design.version,
          clientName: design.event.client.firstName + ' ' + design.event.client.lastName,
          eventTitle: design.event.title,
          designUrl: appUrl + '/events/' + design.eventId + '/designs',
        })
      )
    );
    results.forEach((r, i) => {
      if (!r.success) console.error('[design-approve] email failed for', recipients[i], r.error);
      else console.log('[design-approve] email sent to', recipients[i], 'id:', r.id);
    });
  }

  return NextResponse.json({ success: true, status: 'APPROVED' });
}
