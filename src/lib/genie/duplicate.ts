import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

// Duplicate Event: the copy gets the original's Genie setup, i.e. its settings (each section still following the
// account's Event defaults or customized, as on the original) and its Genie templates with their artwork. Not copied:
// iPads and device spots (back to the default number), payments, the bundle version and lock, and the link to the
// original event's approved client design (that design belongs to the other event), and the template text typed for
// the original (names and dates belong to that event).
const JSON_FIELDS = ['countdownSound', 'lookAtCamera', 'boomerang', 'attract', 'processing', 'filters', 'propIds', 'backdropIds', 'poseIds', 'videoBooth', 'spin360'] as const;

export async function copyGenieSetup(tx: Prisma.TransactionClient, fromEventId: string, toEventId: string, tenantId: string): Promise<boolean> {
  const s = await tx.eventGenieSettings.findFirst({ where: { eventId: fromEventId, tenantId } });
  if (!s) return false;
  const { id: _id, eventId: _e, bundleVersion: _v, bundleHash: _h, lockedAt: _l, maxDevices: _m, createdAt: _c, updatedAt: _u, addOnsIncluded: _ai, templateText: _tt, ...rest } = s;
  const data: Record<string, unknown> = { ...rest };
  // A JSON column's null is written as SQL NULL
  for (const k of JSON_FIELDS) if (k in data && data[k] === null) data[k] = Prisma.DbNull;
  await tx.eventGenieSettings.create({ data: { ...data, eventId: toEventId } as Prisma.EventGenieSettingsUncheckedCreateInput });

  const templates = await tx.eventGenieTemplate.findMany({ where: { eventId: fromEventId, tenantId }, orderBy: { sortOrder: 'asc' } });
  for (const t of templates) {
    await tx.eventGenieTemplate.create({ data: {
      tenantId, eventId: toEventId, name: t.name, sortOrder: t.sortOrder,
      layout: t.layout as Prisma.InputJsonValue,
      alternateLayout: (t.alternateLayout ?? Prisma.DbNull) as Prisma.InputJsonValue,
      thumbnail: (t.thumbnail ?? Prisma.DbNull) as Prisma.InputJsonValue,
      libraryTemplateId: t.libraryTemplateId,
      textOptions: (t.textOptions ?? Prisma.DbNull) as Prisma.InputJsonValue,
    } });
  }
  return true;
}
