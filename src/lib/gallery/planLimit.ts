// Galleries without a paid plan: photos for one event gallery (galleries are deleted after the retention period, so
// this is one at a time). Paid plans and Genie accounts are unlimited.
import { prisma } from '@/lib/prisma/client';
import { hasProAccess } from '@/lib/auth/session';

export const FREE_GALLERY_LIMIT = 1;
export const GALLERY_LIMIT_MESSAGE = 'Your current plan includes photos for one event gallery. Subscribe to add photos to every event.';

// Can photos be added to this gallery? Yes on a paid plan, or if it already has photos, or if fewer than the limit do
export async function canAddGalleryPhotos(tenantId: string, galleryId: string): Promise<boolean> {
  if (await hasProAccess(tenantId)) return true;
  const own = await prisma.galleryAsset.count({ where: { galleryId } });
  if (own > 0) return true;
  const others = await prisma.gallery.count({ where: { tenantId, id: { not: galleryId }, assets: { some: {} } } });
  return others < FREE_GALLERY_LIMIT;
}

// How many event galleries with photos the account has, for the notice on the Gallery page
export async function galleriesWithPhotos(tenantId: string): Promise<number> {
  return prisma.gallery.count({ where: { tenantId, assets: { some: {} } } });
}
