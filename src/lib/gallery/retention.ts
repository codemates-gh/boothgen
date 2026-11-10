import { prisma } from '@/lib/prisma/client';

const DAY_MS = 24 * 3600 * 1000;

export type GalleryRetention = { expireDays: number; deleteDays: number };

// Platform gallery lifecycle (Super Admin → settings): hidden after expireDays, deleted deleteDays later
export async function getGalleryRetention(): Promise<GalleryRetention> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ['gallery_expire_days', 'gallery_delete_days'] } } });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    expireDays: parseInt(map.gallery_expire_days ?? '30', 10),
    deleteDays: parseInt(map.gallery_delete_days ?? '30', 10),
  };
}

// When a gallery for an event on eventDate is hidden (expire cron) and then deleted (delete cron)
export function galleryRetentionDates(eventDate: Date, r: GalleryRetention): { hiddenAt: Date; deletedAt: Date } {
  const hiddenAt = new Date(eventDate.getTime() + r.expireDays * DAY_MS);
  return { hiddenAt, deletedAt: new Date(hiddenAt.getTime() + r.deleteDays * DAY_MS) };
}
