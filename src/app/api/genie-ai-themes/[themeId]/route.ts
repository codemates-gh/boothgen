export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { THEME_PROMPT_MAX, deleteUnusedThemeFiles, eventsUsingTheme, removeThemeEverywhere, sampleFrom, takeUpload, themeView } from '@/lib/genie/ai/themes';

type Ctx = { params: Promise<{ themeId: string }> };
const Edit = z.object({
  scope: z.enum(['mine', 'standard']),
  name: z.string().trim().min(1, 'Give the theme a name').max(60, 'Keep the name to 60 characters').optional(),
  prompt: z.string().trim().min(10, 'Describe the look in a sentence or two').max(THEME_PROMPT_MAX).optional(),
  sampleUrl: z.string().url().optional(),
  // Standard only (Super Admin)
  isActive: z.boolean().optional(),
  fastModel: z.string().trim().max(100).nullable().optional(),
  qualityModel: z.string().trim().max(100).nullable().optional(),
}).strict();

async function load(req: NextRequest, params: Ctx['params']) {
  const parsed = Edit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const auth = await requireLibraryEditor(parsed.data.scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = parsed.data.scope === 'standard' ? null : auth.tenantId;
  const t = await prisma.genieAiTheme.findFirst({ where: { id: (await params).themeId, tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return { body: parsed.data, theme: t, tenantId };
}

// Renames a theme, changes its prompt or sample (Super Admin also: on/off and models)
export async function PATCH(req: NextRequest, props: Ctx) {
  const l = await load(req, props.params);
  if (l instanceof NextResponse) return l;
  const { body: b, theme: t, tenantId } = l;
  const standard = b.scope === 'standard';
  let files = {};
  if (b.sampleUrl) {
    const body = await takeUpload(b.sampleUrl, b.scope, tenantId);
    if ('error' in body) return NextResponse.json({ error: body.error }, { status: 422 });
    const s = await sampleFrom(body, b.scope, tenantId);
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: 422 });
    files = s;
  }
  const saved = await prisma.genieAiTheme.update({
    where: { id: t.id },
    data: {
      ...(b.name ? { name: b.name } : {}), ...(b.prompt ? { prompt: b.prompt } : {}), ...files,
      ...(standard && b.isActive !== undefined ? { isActive: b.isActive } : {}),
      ...(standard && b.fastModel !== undefined ? { fastModel: b.fastModel || null } : {}),
      ...(standard && b.qualityModel !== undefined ? { qualityModel: b.qualityModel || null } : {}),
    },
  });
  if (b.sampleUrl) await deleteUnusedThemeFiles(t);
  return NextResponse.json({ theme: themeView(saved, true) });
}

// Deletes a theme. Used on events: the first call answers 409; ?confirm=1 deletes it and takes it off them.
export async function DELETE(req: NextRequest, props: Ctx) {
  const scope = req.nextUrl.searchParams.get('scope') === 'standard' ? 'standard' as const : 'mine' as const;
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  const t = await prisma.genieAiTheme.findFirst({ where: { id: (await props.params).themeId, tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const events = await eventsUsingTheme(t.id);
  if (events && req.nextUrl.searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: `This theme is used on ${events === 1 ? 'an event' : `${events} events`}. Deleting it takes it off.`, code: 'in_use', events }, { status: 409 });
  }
  if (events) await removeThemeEverywhere(t.id);
  await prisma.genieAiTheme.delete({ where: { id: t.id } });
  await deleteUnusedThemeFiles(t);
  return NextResponse.json({ ok: true });
}
