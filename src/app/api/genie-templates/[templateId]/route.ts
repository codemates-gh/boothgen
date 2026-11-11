export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { canEditTemplate, findDesignerTemplate, libraryView } from '@/lib/genie/library';
import { TemplateBody, clientOptionsData, prepareTemplate } from '@/lib/genie/designer';
import { allowedPrefixes, deleteUnusedTemplateAssets, templateAssetUrls } from '@/lib/genie/templateAssets';

type P = { params: { templateId: string } };

export async function GET(_req: NextRequest, { params }: P) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const t = await findDesignerTemplate(auth, params.templateId);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...libraryView(t), format: t.format, orientation: t.orientation, canEdit: canEditTemplate(auth, t) });
}

export async function PUT(req: NextRequest, { params }: P) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const t = await findDesignerTemplate(auth, params.templateId);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canEditTemplate(auth, t)) return NextResponse.json({ error: 'Standard templates are managed by BoothGen. Duplicate it to make your own.' }, { status: 403 });
  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const scope = t.tenantId === null ? 'standard' : 'mine';
  if (parsed.data.scope && parsed.data.scope !== scope) return NextResponse.json({ error: "A template can't move between Standard and My templates" }, { status: 400 });

  const prepared = await prepareTemplate(parsed.data, t, allowedPrefixes(scope, auth.tenantId));
  if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 422 });
  const { layout, alternateLayout, thumbnail, warnings } = prepared;
  const saved = await prisma.boothDesignTemplate.update({
    where: { id: t.id },
    data: {
      name: parsed.data.name, format: layout.format, orientation: layout.orientation,
      photoCount: new Set(layout.slots.map(s => s.shotIndex)).size,
      layout, alternateLayout: alternateLayout ?? Prisma.DbNull,
      genieThumbnail: thumbnail ?? Prisma.DbNull, ...(thumbnail ? { thumbnailUrl: thumbnail.url } : {}),
      ...(scope === 'standard' && parsed.data.isPublished !== undefined ? { isPublished: parsed.data.isPublished } : {}),
      ...(scope === 'mine' && parsed.data.offerToClients !== undefined ? { offerToClients: parsed.data.offerToClients } : {}),
      ...clientOptionsData(parsed.data),
    },
  });
  // Images this template no longer uses, unless something else still does
  const kept = new Set(templateAssetUrls(saved));
  await deleteUnusedTemplateAssets(templateAssetUrls(t).filter(u => !kept.has(u)));
  return NextResponse.json({ ...libraryView(saved), warnings });
}

// Hides the template from the library. Events keep their copies; design briefs that chose it keep working.
export async function DELETE(_req: NextRequest, { params }: P) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const t = await findDesignerTemplate(auth, params.templateId);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canEditTemplate(auth, t)) return NextResponse.json({ error: 'Only your own templates can be deleted here' }, { status: 403 });
  await prisma.boothDesignTemplate.update({ where: { id: t.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
