export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendDesignDecisionEmail } from '@/lib/email/send';
import { z } from 'zod';

const Schema = z.object({
  portalToken: z.string().min(1),
  revisionNote: z.string().min(1, 'Revision note is required'),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });

  const { portalToken, revisionNote } = parsed.data;

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
  if (design.event.portalToken !== portalToken) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  if (design.status === 'APPROVED') return NextResponse.json({ error: 'Design is already approved and cannot be changed' }, { status: 400 });
  if (design.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is not pending approval' }, { status: 400 });

  await prisma.templateDesign.update({
    where: { id: params.id },
    data: { status: 'REVISION_REQUESTED', revisionNote },
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

  console.log('[design-revision] recipients:', recipients, '| adminEmails:', adminEmails, '| replyTo:', replyTo);

  if (recipients.length === 0) {
    console.error('[design-revision] no recipients found for tenant', design.tenantId);
  } else {
    const results = await Promise.all(
      recipients.map(to =>
        sendDesignDecisionEmail({
          to,
          decision: 'revision_requested',
          version: design.version,
          clientName: design.event.client.firstName + ' ' + design.event.client.lastName,
          eventTitle: design.event.title,
          revisionNote,
          designUrl: appUrl + '/events/' + design.eventId + '/designs',
        })
      )
    );
    results.forEach((r, i) => {
      if (!r.success) console.error('[design-revision] email failed for', recipients[i], r.error);
      else console.log('[design-revision] email sent to', recipients[i], 'id:', r.id);
    });
  }

  return NextResponse.json({ success: true, status: 'REVISION_REQUESTED' });
}
