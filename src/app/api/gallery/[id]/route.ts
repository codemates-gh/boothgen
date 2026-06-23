export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendGalleryPublishedEmail } from '@/lib/email/send';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { event: { select: { title: true, eventDate: true, portalToken: true } }, _count: { select: { assets: true } } },
  });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(gallery);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.gallery.update({
    where: { id: params.id },
    data: {
      ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.accessCode !== undefined && { accessCode: body.accessCode || null }),
    },
    include: { event: { include: { client: true, tenant: { include: { branding: true } } } } },
  });

  // Send notification email when gallery is published for the first time
  if (body.isPublished === true && !gallery.isPublished) {
    const event = (updated as any).event;
    const branding = event?.tenant?.branding;
    const companyName = branding?.companyName ?? event?.tenant?.name ?? 'Your host';
    const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    sendGalleryPublishedEmail({
      to: event.client.email,
      firstName: event.client.firstName,
      companyName,
      galleryTitle: updated.title,
      portalUrl: `${appUrl}/portal/${event.portalToken}?tab=gallery`,
      replyTo: branding?.replyToEmail ?? undefined,
      from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
    }).catch(e => console.error('[gallery-publish] email error:', e));
  }

  return NextResponse.json(updated);
}
