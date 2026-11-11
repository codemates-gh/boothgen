import { Prisma, type BoothDesignTemplate } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { StoredLayout } from './schemas';

// Genie template library: Standard (BoothGen-managed, tenantId null, published) and My templates (the tenant's own).
// A BoothDesignTemplate shows in the library once it has a Genie layout.
export function libraryWhere(tenantId: string): Prisma.BoothDesignTemplateWhereInput {
  return {
    isActive: true,
    layout: { not: Prisma.AnyNull },
    OR: [{ tenantId: null, isPublished: true }, { tenantId }],
  };
}

export async function findLibraryTemplate(tenantId: string, id: string) {
  return prisma.boothDesignTemplate.findFirst({ where: { id, ...libraryWhere(tenantId) } });
}

export function libraryView(t: BoothDesignTemplate) {
  const layout = StoredLayout.safeParse(t.layout);
  const alternate = t.alternateLayout ? StoredLayout.safeParse(t.alternateLayout) : null;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    scope: t.tenantId ? 'mine' as const : 'standard' as const,
    thumbnailUrl: t.thumbnailUrl,
    thumbnail: (t.genieThumbnail as { url: string } | null) ?? null,
    isPublished: t.isPublished,
    offerToClients: t.offerToClients,
    textZones: (t.textZones as unknown[]) ?? [],
    colorVariants: (t.colorVariants as unknown[]) ?? [],
    fontPairings: (t.fontPairings as unknown[]) ?? [],
    layout: layout.success ? layout.data : null,
    alternateLayout: alternate?.success ? alternate.data : null,
  };
}

// Templates the designer may open: the tenant's own, published Standard ones, and (for super admins) every Standard one
export async function findDesignerTemplate(auth: { tenantId: string | null; superAdmin: boolean }, id: string) {
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id, isActive: true, OR: [...(auth.tenantId ? [{ tenantId: auth.tenantId }] : []), { tenantId: null }] } });
  if (!t) return null;
  if (t.tenantId === null && !auth.superAdmin && !(t.isPublished && t.layout !== null)) return null;
  return t;
}

export function canEditTemplate(auth: { tenantId: string | null; superAdmin: boolean }, t: Pick<BoothDesignTemplate, 'tenantId'>): boolean {
  return t.tenantId === null ? auth.superAdmin : t.tenantId === auth.tenantId;
}

// Copies a library template onto the event, last in the guest picker order
export async function copyToEvent(tenantId: string, eventId: string, lib: BoothDesignTemplate, withAlternate: boolean) {
  const layout = StoredLayout.safeParse(lib.layout);
  if (!layout.success) return { error: "This template's layout is incomplete. Open it in the designer and save it again." };
  const alternate = withAlternate && lib.alternateLayout ? StoredLayout.safeParse(lib.alternateLayout) : null;
  if (alternate && !alternate.success) return { error: "This template's alternate layout is incomplete." };
  const last = await prisma.eventGenieTemplate.findFirst({ where: { eventId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const template = await prisma.eventGenieTemplate.create({
    data: {
      tenantId, eventId, name: lib.name.slice(0, 80), sortOrder: (last?.sortOrder ?? -1) + 1,
      layout: layout.data, ...(alternate?.success ? { alternateLayout: alternate.data } : {}), libraryTemplateId: lib.id,
      ...(lib.genieThumbnail ? { thumbnail: lib.genieThumbnail } : {}),
    },
  });
  return { template };
}

// The layout the client chose in their design brief, when it has a Genie layout
export async function briefLibraryTemplate(tenantId: string, eventId: string) {
  const brief = await prisma.eventDesignBrief.findFirst({ where: { eventId, tenantId }, select: { templateId: true } });
  return brief?.templateId ? findLibraryTemplate(tenantId, brief.templateId) : null;
}
