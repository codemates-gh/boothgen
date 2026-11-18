export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { ClipDesignBody, clipDesignData, clipDesignView, designLibrary, prepareClipDesign, standardPrintDesigns } from '@/lib/genie/clipDesigns';
import { allowedPrefixes } from '@/lib/genie/templateAssets';

// Boomerang designs: what the event's Frame picker offers (switched-on Standard, My Boomerang designs, and the
// account's single-photo print designs). Super admins also get every Standard design, switched off ones included.
export async function GET() {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const lib = auth.tenantId ? await designLibrary(auth.tenantId) : { standard: [], mine: [], print: [], standardPrint: await standardPrintDesigns() };
  const standard = auth.superAdmin
    ? (await prisma.genieClipDesign.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).map(clipDesignView)
    : lib.standard;
  return NextResponse.json({ ...lib, standard, superAdmin: auth.superAdmin });
}

export async function POST(req: NextRequest) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const parsed = ClipDesignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const scope = parsed.data.scope ?? 'mine';
  if (scope === 'standard' && !auth.superAdmin) return NextResponse.json({ error: 'Only BoothGen can add Standard designs' }, { status: 403 });
  if (scope === 'mine' && !auth.tenantId) return NextResponse.json({ error: 'Sign in to an account to make your own designs' }, { status: 400 });
  const prepared = await prepareClipDesign(parsed.data, null, allowedPrefixes(scope, auth.tenantId));
  if ('error' in prepared) return NextResponse.json({ error: prepared.error }, { status: 422 });
  const d = await prisma.genieClipDesign.create({
    data: {
      ...clipDesignData(parsed.data, prepared.assets),
      tenantId: scope === 'standard' ? null : auth.tenantId,
      source: parsed.data.source ?? 'designer',
      isActive: scope === 'standard' ? (parsed.data.isActive ?? false) : true,
    },
  });
  return NextResponse.json(clipDesignView(d), { status: 201 });
}
