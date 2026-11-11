import { Prisma, type BoothDesignTemplate } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import type { StoredLayout } from '@/lib/genie/schemas';

// Layouts a client can pick in their design brief (portal → Design): BoothGen's published Standard layouts the
// operator hasn't hidden, plus the operator's own templates they offer to clients. Only layouts with photo frames,
// so the pick can go straight into Genie once the design is approved.
export async function hiddenStandardIds(tenantId: string): Promise<string[]> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { hiddenStandardTemplates: true } });
  return Array.isArray(t?.hiddenStandardTemplates) ? (t!.hiddenStandardTemplates as string[]) : [];
}

export async function clientTemplatesWhere(tenantId: string): Promise<Prisma.BoothDesignTemplateWhereInput> {
  const hidden = await hiddenStandardIds(tenantId);
  return {
    isActive: true,
    layout: { not: Prisma.AnyNull },
    OR: [
      { tenantId: null, isPublished: true, ...(hidden.length ? { id: { notIn: hidden } } : {}) },
      { tenantId, offerToClients: true },
    ],
  };
}

export async function clientTemplates(tenantId: string) {
  const rows = await prisma.boothDesignTemplate.findMany({ where: await clientTemplatesWhere(tenantId), orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  // The operator's own templates first, then Standard
  return [...rows.filter(r => r.tenantId), ...rows.filter(r => !r.tenantId)].map(clientTemplateView);
}

// What the portal shows: the designer's rendered picture, frame count from the layout
export function clientTemplateView(t: BoothDesignTemplate) {
  const layout = t.layout as { slots?: { shotIndex: number }[] } | null;
  return {
    id: t.id, name: t.name, description: t.description, format: t.format, orientation: t.orientation,
    photoCount: layout?.slots ? new Set(layout.slots.map(s => s.shotIndex)).size : t.photoCount,
    thumbnailUrl: (t.genieThumbnail as { url?: string } | null)?.url ?? t.thumbnailUrl,
    textZones: t.textZones, colorVariants: t.colorVariants, fontPairings: t.fontPairings,
    scope: t.tenantId ? 'mine' as const : 'standard' as const,
    layout: t.layout as unknown as StoredLayout | null, // photo frames, for a preview when there's no picture
  };
}
