export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTemplateEditor, type TemplateAuth } from '@/lib/genie/admin';
import { ClipDesignBody, clipAssets, clipDesignData, clipDesignView, prepareClipDesign } from '@/lib/genie/clipDesigns';
import { allowedPrefixes, deleteUnusedTemplateAssets } from '@/lib/genie/templateAssets';

type P = { params: Promise<{ designId: string }> };

// Designs the designer may open: the account's own and Standard ones (switched-off Standard: super admins only)
async function findDesign(auth: TemplateAuth, id: string) {
  const d = await prisma.genieClipDesign.findFirst({ where: { id, OR: [...(auth.tenantId ? [{ tenantId: auth.tenantId }] : []), { tenantId: null }] } });
  if (!d || (d.tenantId === null && !d.isActive && !auth.superAdmin)) return null;
  return d;
}
const canEdit = (auth: TemplateAuth, d: { tenantId: string | null }) => d.tenantId === null ? auth.superAdmin : d.tenantId === auth.tenantId;
const urls = (d: Parameters<typeof clipAssets>[0]) => clipAssets(d).map(a => a.url);

export async function GET(_req: NextRequest, props: P) {
  const { designId } = await props.params;
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const d = await findDesign(auth, designId);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...clipDesignView(d), canEdit: canEdit(auth, d) });
}

// Saving raises the version, so iPads redraw the design
export async function PUT(req: NextRequest, props: P) {
  const { designId } = await props.params;
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const d = await findDesign(auth, designId);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canEdit(auth, d)) return NextResponse.json({ error: 'Standard designs are managed by BoothGen' }, { status: 403 });
  const parsed = ClipDesignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const scope = d.tenantId === null ? 'standard' : 'mine';
  if (parsed.data.scope && parsed.data.scope !== scope) return NextResponse.json({ error: "A design can't move between Standard and My designs" }, { status: 400 });
  const prepared = await prepareClipDesign(parsed.data, d, allowedPrefixes(scope, auth.tenantId));
  if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 422 });
  const saved = await prisma.genieClipDesign.update({
    where: { id: d.id },
    data: {
      ...clipDesignData(parsed.data, prepared.assets), version: { increment: 1 },
      ...(scope === 'standard' && parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });
  const kept = new Set(urls(saved));
  await deleteUnusedTemplateAssets(urls(d).filter(u => !kept.has(u)));
  return NextResponse.json(clipDesignView(saved));
}

// Standard: switch on/off for operators (events that already chose it keep it)
export async function PATCH(req: NextRequest, props: P) {
  const { designId } = await props.params;
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const d = await findDesign(auth, designId);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (d.tenantId !== null || !auth.superAdmin) return NextResponse.json({ error: 'Only Standard designs are switched on and off' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.isActive !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  return NextResponse.json(clipDesignView(await prisma.genieClipDesign.update({ where: { id: d.id }, data: { isActive: body.isActive } })));
}

// Events that chose it drop it from the bundle (plain Boomerang) and show a notice in the editor
export async function DELETE(_req: NextRequest, props: P) {
  const { designId } = await props.params;
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const d = await findDesign(auth, designId);
  if (!d) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canEdit(auth, d)) return NextResponse.json({ error: 'Only your own designs can be deleted' }, { status: 403 });
  await prisma.genieClipDesign.delete({ where: { id: d.id } });
  await deleteUnusedTemplateAssets(urls(d));
  return NextResponse.json({ ok: true });
}
