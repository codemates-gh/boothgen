export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { PROMPT_PREAMBLE, aiSettings } from '@/lib/genie/ai/settings';
import { renderWithGoogle } from '@/lib/genie/ai/provider';
import { toJpeg } from '@/lib/genie/ai/image';
import { deleteUnusedThemeFiles, sampleFrom, takeUpload, themeView } from '@/lib/genie/ai/themes';
import { AI_INPUT_MAX_SIDE } from '@/lib/genie/ai/renders';

const TRIES_PER_DAY = 20;

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  // The operator's own test photo, uploaded with /api/genie-ai-themes/upload
  photoUrl: z.string().url(),
  people: z.number().int().min(0).max(30).optional(),
  // Save the result as the theme's sample
  useAsSample: z.boolean().optional(),
}).strict();

// "Try it": renders the operator's own photo in the theme (the same prompt and model the booth uses) and returns the
// result; it can become the theme's sample. Doesn't use any event's renders; operators get 20 tries a day.
export async function POST(req: NextRequest, props: { params: Promise<{ themeId: string }> }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const b = parsed.data;
  const auth = await requireLibraryEditor(b.scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = b.scope === 'standard' ? null : auth.tenantId;
  const theme = await prisma.genieAiTheme.findFirst({ where: { id: (await props.params).themeId, tenantId } });
  if (!theme) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (tenantId) {
    const key = `ai_tries:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const n = Number(row?.value ?? 0);
    if (n >= TRIES_PER_DAY) return NextResponse.json({ error: `You've used today's ${TRIES_PER_DAY} tries. Try again tomorrow.` }, { status: 429 });
    await prisma.systemSetting.upsert({ where: { key }, update: { value: String(n + 1) }, create: { key, value: '1' } });
  }

  const photo = await takeUpload(b.photoUrl, b.scope, tenantId);
  if ('error' in photo) return NextResponse.json({ error: photo.error }, { status: 422 });
  const input = await toJpeg(photo, AI_INPUT_MAX_SIDE);
  if (!input) return NextResponse.json({ error: "That photo couldn't be read." }, { status: 422 });
  const s = await aiSettings();
  const quality = b.people === 0 || (b.people ?? 1) >= 3;
  const model = (quality ? theme.qualityModel : theme.fastModel) || (quality ? s.qualityModel : s.fastModel);
  const out = await renderWithGoogle(input.body, PROMPT_PREAMBLE + '\n\nStyle: ' + theme.prompt, model);
  if (!out.ok) return NextResponse.json({ error: out.message, blocked: out.blocked }, { status: 422 });
  const jpeg = await toJpeg(out.image, 1200, 3);
  if (!jpeg) return NextResponse.json({ error: "The AI result couldn't be read." }, { status: 502 });

  let saved = theme;
  if (b.useAsSample) {
    const files = await sampleFrom(jpeg.body, b.scope, tenantId);
    if ('error' in files) return NextResponse.json({ error: files.error }, { status: 422 });
    saved = await prisma.genieAiTheme.update({ where: { id: theme.id }, data: files });
    await deleteUnusedThemeFiles(theme);
  }
  return NextResponse.json({ image: 'data:image/jpeg;base64,' + jpeg.body.toString('base64'), model, theme: themeView(saved, true) });
}
