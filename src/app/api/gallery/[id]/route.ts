export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { hasProAccess } from '@/lib/auth/session';
import { sendGalleryPublishedEmail } from '@/lib/email/send';
import { triggerAutomation } from '@/lib/inngest/trigger';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await hasProAccess(session.tenantId)) return NextResponse.json({ error: 'Pro subscription required', upgrade: true }, { status: 403 });
  const [gallery, retentionSettings] = await Promise.all([
    prisma.gallery.findFirst({
      where: { id: params.id, tenantId: session.tenantId },
      include: { event: { select: { title: true, eventDate: true, portalToken: true } }, _count: { select: { assets: true } } },
    }),
    prisma.systemSetting.findMany({ where: { key: { in: ['gallery_expire_days', 'gallery_delete_days'] } } }),
  ]);
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const retentionMap = Object.fromEntries(retentionSettings.map(s => [s.key, s.value]));
  const expireDays  = parseInt(retentionMap.gallery_expire_days  ?? '30', 10);
  const deleteDays  = parseInt(retentionMap.gallery_delete_days  ?? '30', 10);
  return NextResponse.json({ ...gallery, expireDays, deleteDays });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await hasProAccess(session.tenantId)) return NextResponse.json({ error: 'Pro subscription required', upgrade: true }, { status: 403 });
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
    // Skip hardcoded email if an active automation rule covers GALLERY_PUBLISHED
    const hasGalleryRule = updated.eventId
      ? await prisma.automationRule.count({ where: { tenantId: session.tenantId, trigger: 'GALLERY_PUBLISHED', isActive: true, actionType: 'EMAIL' } }) > 0
      : false;
    if (!hasGalleryRule) {
      await sendGalleryPublishedEmail({
        to: event.client.email,
        firstName: event.client.firstName,
        companyName,
        galleryTitle: updated.title,
        portalUrl: `${appUrl}/portal/${event.portalToken}?tab=gallery`,
        replyTo: branding?.replyToEmail ?? undefined,
        from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
      }).catch(e => console.error('[gallery-publish] email error:', e));
    }
    if (updated.eventId) {
      triggerAutomation({ tenantId: session.tenantId, eventId: updated.eventId, trigger: 'GALLERY_PUBLISHED' }).catch(e =>
        console.error('[gallery-publish] GALLERY_PUBLISHED automation error:', e)
      );
    }
  }

  return NextResponse.json(updated);
}
