export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendDesignReadyEmail } from '@/lib/email/send';

// Send to Client: emails the client that a draft design is ready to review. HOST_ADMIN only (client-facing email).
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId: session.tenantId, userId: session.userId as string, status: 'ACTIVE', role: 'HOST_ADMIN' },
  });
  if (!membership) return NextResponse.json({ error: 'Forbidden: HOST_ADMIN role required' }, { status: 403 });

  const design = await prisma.templateDesign.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { event: { include: { client: true } }, tenant: { include: { branding: { select: { companyName: true } } } } },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (design.status === 'APPROVED') return NextResponse.json({ error: 'Design is already approved' }, { status: 400 });
  if (design.status === 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is already pending approval' }, { status: 400 });
  if (design.status !== 'DRAFT') return NextResponse.json({ error: 'Upload a new version to send' }, { status: 400 });

  // Only the newest version can go out; older ones were replaced
  const newest = await prisma.templateDesign.findFirst({ where: { eventId: design.eventId, tenantId: session.tenantId }, orderBy: { version: 'desc' }, select: { id: true } });
  if (newest?.id !== design.id) return NextResponse.json({ error: 'A newer version exists. Send that one instead.' }, { status: 400 });

  const client = design.event.client;
  if (!client?.email) return NextResponse.json({ error: 'This event has no client email' }, { status: 400 });

  // Email first (awaited, so the function isn't frozen before it sends), then mark it sent
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  const result = await sendDesignReadyEmail({
    to: client.email,
    firstName: client.firstName ?? 'there',
    companyName: design.tenant.branding?.companyName || design.tenant.name || 'Your photo booth company',
    version: design.version,
    portalUrl: appUrl + '/portal/' + design.event.portalToken + '?tab=design',
  });
  if (!result.success) {
    console.error('[design-send] sendDesignReadyEmail failed:', result.error);
    return NextResponse.json({ error: 'The email could not be sent. Try again.' }, { status: 502 });
  }

  const updated = await prisma.templateDesign.update({
    where: { id: design.id },
    data: { status: 'PENDING_APPROVAL' },
  });

  return NextResponse.json(updated);
}
