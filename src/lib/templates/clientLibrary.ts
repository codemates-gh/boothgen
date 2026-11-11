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

// Hide or show a published Standard layout in this operator's library and their clients' picker
export async function setStandardHidden(tenantId: string, templateId: string, hidden: boolean): Promise<{ hidden: string[] } | { error: string; status: number }> {
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: templateId, tenantId: null, isPublished: true, isActive: true }, select: { id: true } });
  if (!t) return { error: 'Not found', status: 404 };
  return prisma.$transaction(async tx => {
    const row = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { hiddenStandardTemplates: true } });
    const current = Array.isArray(row.hiddenStandardTemplates) ? (row.hiddenStandardTemplates as string[]) : [];
    const next = hidden ? Array.from(new Set([...current, templateId])) : current.filter(id => id !== templateId);
    await tx.tenant.update({ where: { id: tenantId }, data: { hiddenStandardTemplates: next } });
    return { hidden: next };
  });
}

// Settings → Booth Templates: every published Standard layout (hidden ones flagged) plus this operator's offered templates
export async function operatorClientLibrary(tenantId: string) {
  const hidden = new Set(await hiddenStandardIds(tenantId));
  const rows = await prisma.boothDesignTemplate.findMany({
    where: { isActive: true, layout: { not: Prisma.AnyNull }, OR: [{ tenantId: null, isPublished: true }, { tenantId, offerToClients: true }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return [...rows.filter(r => r.tenantId), ...rows.filter(r => !r.tenantId)].map(r => ({ ...clientTemplateView(r), hidden: hidden.has(r.id) }));
}
