import { prisma } from '@/lib/prisma/client';
import { notifyGalleryPublished } from '@/lib/gallery/publish';
import { VALID_AFTER_END_MS, bundleValidUntil } from '@/lib/genie/bundle';

// "Publish the gallery when the event ends" (Gallery section of the Genie settings, 2.119.0; on by default for Genius
// accounts): once a Genie event has ended (its end time, or the end of the event day in its time zone), its gallery is
// published if it has photos, and the client gets the usual "gallery published" email or automation. Done once per
// event (galleryAutoPublishedAt): if the operator unpublishes afterwards, it stays unpublished. Run every 15 minutes.
export async function autoPublishEndedGalleries(now = new Date()): Promise<{ published: number }> {
  const candidates = await prisma.eventGenieSettings.findMany({
    where: {
      galleryAutoPublish: true, galleryAutoPublishedAt: null,
      // The event day is today or earlier (and recent: older events were handled when they ended)
      event: { eventDate: { lte: now, gte: new Date(now.getTime() - 14 * 86400_000) } },
    },
    select: {
      id: true, timeZone: true,
      event: { select: { eventDate: true, endTime: true, gallery: { select: { id: true, isPublished: true, isExpired: true, _count: { select: { assets: true } } } } } },
    },
  });
  let published = 0;
  for (const s of candidates) {
    const endedAt = bundleValidUntil(s.event, s.timeZone).getTime() - VALID_AFTER_END_MS;
    if (endedAt > now.getTime()) continue;
    const g = s.event.gallery;
    // No photos yet (or no gallery): try again on the next run
    if (!g || g._count.assets === 0) continue;
    // Claim it once, even if two runs overlap
    const claimed = await prisma.eventGenieSettings.updateMany({ where: { id: s.id, galleryAutoPublishedAt: null }, data: { galleryAutoPublishedAt: now } });
    if (claimed.count === 0 || g.isPublished || g.isExpired) continue;
    await prisma.gallery.update({ where: { id: g.id }, data: { isPublished: true } });
    await notifyGalleryPublished(g.id);
    published++;
  }
  return { published };
}
