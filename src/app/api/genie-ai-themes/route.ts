export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin, requireLibraryEditor } from '@/lib/genie/admin';
import { THEME_PROMPT_MAX, ensurePlaceholders, libraryThemes, sampleFrom, takeUpload, themeView } from '@/lib/genie/ai/themes';

// The operator's Geniefied themes: Standard themes that are on (no prompt) and My themes (with prompt)
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const all = await ensurePlaceholders(await libraryThemes(auth.tenantId));
  return NextResponse.json({
    standard: all.filter(t => !t.tenantId).map(t => themeView(t, false)),
    mine: all.filter(t => t.tenantId).map(t => themeView(t, true)),
  });
}

const Create = z.object({
  scope: z.enum(['mine', 'standard']),
  name: z.string().trim().min(1, 'Give the theme a name').max(60, 'Keep the name to 60 characters'),
  prompt: z.string().trim().min(10, 'Describe the look in a sentence or two').max(THEME_PROMPT_MAX, `Keep the prompt to ${THEME_PROMPT_MAX} characters`),
  // An uploaded sample picture (optional: "Try it" can make one)
  sampleUrl: z.string().url().optional(),
}).strict();

// A new theme (My themes, or Standard for Super Admin)
export async function POST(req: NextRequest) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, name, prompt, sampleUrl } = parsed.data;
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  let files = {};
  if (sampleUrl) {
    const body = await takeUpload(sampleUrl, scope, tenantId);
    if ('error' in body) return NextResponse.json({ error: body.error }, { status: 422 });
    const s = await sampleFrom(body, scope, tenantId);
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: 422 });
    files = s;
  }
  const last = await prisma.genieAiTheme.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const [t] = await ensurePlaceholders([await prisma.genieAiTheme.create({ data: { tenantId, name, prompt, ...files, sortOrder: (last?.sortOrder ?? -1) + 1 } })]);
  return NextResponse.json({ theme: themeView(t, true) }, { status: 201 });
}
