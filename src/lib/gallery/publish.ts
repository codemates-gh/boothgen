import { prisma } from '@/lib/prisma/client';
import { sendGalleryPublishedEmail } from '@/lib/email/send';
import { triggerAutomation } from '@/lib/inngest/trigger';
import { isBoothClient } from '@/lib/genie/boothClient';

// After a gallery is published for the first time (by the operator, or automatically when a Genie event ends): the
// client gets the "gallery published" email with the portal link, unless an active GALLERY_PUBLISHED email automation
// covers it, and the GALLERY_PUBLISHED automations run. Booth events (Genie-only, no real client) get no email.
export async function notifyGalleryPublished(galleryId: string): Promise<void> {
  const gallery = await prisma.gallery.findUnique({
    where: { id: galleryId },
    include: { event: { include: { client: true, tenant: { include: { branding: true } } } } },
  });
  const event = gallery?.event;
  if (!gallery || !event) return;
  const branding = event.tenant?.branding;
  const companyName = branding?.companyName ?? event.tenant?.name ?? 'Your host';
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  // Skip the built-in email if an active automation rule covers GALLERY_PUBLISHED
  const hasGalleryRule = (await prisma.automationRule.count({ where: { tenantId: gallery.tenantId, trigger: 'GALLERY_PUBLISHED', isActive: true, actionType: 'EMAIL' } })) > 0;
  if (!hasGalleryRule && event.client && !isBoothClient(event.client)) {
    await sendGalleryPublishedEmail({
      to: event.client.email,
      firstName: event.client.firstName,
      companyName,
      galleryTitle: gallery.title,
      portalUrl: `${appUrl}/portal/${event.portalToken}?tab=gallery`,
      accessCode: gallery.accessCode ?? null,
      replyTo: branding?.replyToEmail ?? undefined,
      from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
    }).catch(e => console.error('[gallery-publish] email error:', e));
  }
  await triggerAutomation({ tenantId: gallery.tenantId, eventId: event.id, trigger: 'GALLERY_PUBLISHED' }).catch(e =>
    console.error('[gallery-publish] GALLERY_PUBLISHED automation error:', e)
  );
}
