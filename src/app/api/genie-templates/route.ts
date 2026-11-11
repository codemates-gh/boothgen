export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { findDesignerTemplate, libraryView, libraryWhere } from '@/lib/genie/library';
import { TemplateBody, clientOptionsData, prepareTemplate } from '@/lib/genie/designer';
import { allowedPrefixes } from '@/lib/genie/templateAssets';
import { hiddenStandardIds } from '@/lib/templates/clientLibrary';

// Genie template library: Standard and My templates. Super admins also see unpublished Standard templates and
// Standard booth templates that don't have a Genie layout yet.
export async function GET() {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const where: Prisma.BoothDesignTemplateWhereInput = auth.superAdmin
    ? { isActive: true, OR: [{ tenantId: null }, ...(auth.tenantId ? [{ tenantId: auth.tenantId, layout: { not: Prisma.AnyNull } }] : [])] }
    : libraryWhere(auth.tenantId!);
  const rows = await prisma.boothDesignTemplate.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  // Standard layouts this operator hid stay listed (flagged) so they can show them again
  const hidden = new Set(auth.tenantId ? await hiddenStandardIds(auth.tenantId) : []);
  const all = rows.map(libraryView).filter(t => t.layout || auth.superAdmin).map(t => ({ ...t, hidden: t.scope === 'standard' && hidden.has(t.id) }));
  return NextResponse.json({ standard: all.filter(t => t.scope === 'standard'), mine: all.filter(t => t.scope === 'mine'), superAdmin: auth.superAdmin });
}

export async function POST(req: NextRequest) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const scope = parsed.data.scope ?? 'mine';
  if (scope === 'standard' && !auth.superAdmin) return NextResponse.json({ error: 'Only BoothGen can add Standard templates' }, { status: 403 });
  if (scope === 'mine' && !auth.tenantId) return NextResponse.json({ error: 'Sign in to an account to make your own templates' }, { status: 400 });

  const source = parsed.data.copyFrom ? await findDesignerTemplate(auth, parsed.data.copyFrom) : null;
  if (parsed.data.copyFrom && !source) return NextResponse.json({ error: 'Template to copy not found' }, { status: 404 });
  const prepared = await prepareTemplate(parsed.data, null, allowedPrefixes(scope, auth.tenantId), source);
  if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 422 });
  const { layout, alternateLayout, thumbnail, warnings } = prepared;
  const t = await prisma.boothDesignTemplate.create({
    data: {
      tenantId: scope === 'standard' ? null : auth.tenantId,
      name: parsed.data.name, format: layout.format, orientation: layout.orientation,
      photoCount: new Set(layout.slots.map(s => s.shotIndex)).size,
      layout, ...(alternateLayout ? { alternateLayout } : {}),
      ...(thumbnail ? { genieThumbnail: thumbnail, thumbnailUrl: thumbnail.url } : {}),
      // My templates never publish: they'd otherwise surface as Standard if the tenant were deleted (relation is SetNull)
      isPublished: scope === 'standard' ? (parsed.data.isPublished ?? false) : false,
      offerToClients: scope === 'mine' ? (parsed.data.offerToClients ?? false) : false,
      ...(source ? { description: source.description, textZones: source.textZones ?? [], colorVariants: source.colorVariants ?? [], fontPairings: source.fontPairings ?? [] } : {}),
      ...clientOptionsData(parsed.data),
    },
  });
  return NextResponse.json({ ...libraryView(t), warnings }, { status: 201 });
}
