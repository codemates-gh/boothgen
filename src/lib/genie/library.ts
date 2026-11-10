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
    layout: layout.success ? layout.data : null,
    alternateLayout: alternate?.success ? alternate.data : null,
  };
}
