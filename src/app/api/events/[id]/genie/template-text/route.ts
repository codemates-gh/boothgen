export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { findAdminEvent, isLocked, lockedError } from '@/lib/genie/eventAdmin';
import { EventTextOptions, TemplateTextAnswers, eventAnswers, eventBrief, eventLook, hasText, templateHasText, textOptionsOf } from '@/lib/genie/eventText';
import { TEMPLATE_CLIP_FORMAT } from '@/lib/genie/schemas';
import { TextAdjust, labelKey, valuesFor } from '@/lib/templates/textLayer';

// Event → Genie → Template text: the words drawn on the event's templates (one set per event), and each template's
// palette and fonts. The client's design brief fills them in; the operator can type or change them here.

async function view(tenantId: string, eventId: string) {
  const event = await findAdminEvent(tenantId, eventId);
  if (!event) return null;
  const templates = (await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id, tenantId }, orderBy: { sortOrder: 'asc' } }))
    .filter(t => templateHasText(t) && !t.designId);
  const brief = await eventBrief(event.id);
  const typed = TemplateTextAnswers.safeParse(event.genieSettings?.templateText ?? {});
  const typedKeys = new Set(Object.keys(typed.success ? typed.data : {}).map(labelKey));
  const fromBrief = eventAnswers(brief, {});
  const answers = eventAnswers(brief, event.genieSettings?.templateText);

  const fields = new Map<string, { key: string; label: string; required: boolean; maxChars: number; placeholder: string }>();
  const out: Record<string, unknown>[] = [];
  for (const t of templates) {
    const opts = await textOptionsOf(t);
    const used = new Set([t.layout, t.alternateLayout].flatMap(l => ((l as { texts?: { zoneId: string }[] } | null)?.texts ?? []).map(b => b.zoneId)));
    for (const z of opts.textZones) {
      const key = labelKey(z.label);
      if (!used.has(z.id)) continue;
      const f = fields.get(key);
      fields.set(key, { key, label: f?.label ?? z.label, required: (f?.required ?? false) || z.required, maxChars: Math.max(f?.maxChars ?? 0, z.maxChars), placeholder: f?.placeholder || z.placeholder || '' });
    }
    const look = eventLook(opts, t.libraryTemplateId, brief);
    out.push({
      id: t.id, name: t.name, layout: t.layout, alternateLayout: t.alternateLayout,
      textZones: opts.textZones, colorVariants: opts.colorVariants, fontPairings: opts.fontPairings,
      paletteId: look.paletteId, pairingId: look.pairingId, chosenByOperator: { palette: !!opts.paletteId, pairing: !!opts.pairingId },
      adjust: opts.adjust ?? {}, values: valuesFor(opts.textZones, answers),
    });
  }
  // The Boomerang's template, when it has text (its palette and fonts follow the client's brief, else its first)
  const choice = (event.genieSettings?.boomerang as { format?: string; design?: { source?: string; id?: string } } | null);
  if (choice?.design?.source === 'print' && choice.design.id) {
    const lib = await prisma.boothDesignTemplate.findUnique({ where: { id: choice.design.id } });
    const want = TEMPLATE_CLIP_FORMAT.find(x => x.clip === choice.format);
    const layout = lib ? [lib.layout, lib.alternateLayout].find(l => (l as { format?: string; orientation?: string } | null)?.format === want?.format && (l as { orientation?: string }).orientation === want?.orientation) : null;
    if (lib && layout && hasText(layout)) {
      const opts = await textOptionsOf({ textOptions: null, libraryTemplateId: lib.id });
      const used = new Set(((layout as { texts?: { zoneId: string }[] }).texts ?? []).map(b => b.zoneId));
      for (const z of opts.textZones) {
        const key = labelKey(z.label);
        if (!used.has(z.id)) continue;
        const f = fields.get(key);
        fields.set(key, { key, label: f?.label ?? z.label, required: (f?.required ?? false) || z.required, maxChars: Math.max(f?.maxChars ?? 0, z.maxChars), placeholder: f?.placeholder || z.placeholder || '' });
      }
      const look = eventLook(opts, lib.id, brief);
      out.push({
        id: 'boomerang', boomerang: true, name: 'Boomerang: ' + lib.name, layout, alternateLayout: null,
        textZones: opts.textZones, colorVariants: opts.colorVariants, fontPairings: opts.fontPairings,
        paletteId: look.paletteId, pairingId: look.pairingId, chosenByOperator: { palette: false, pairing: false },
        adjust: {}, values: valuesFor(opts.textZones, answers),
      });
    }
  }
  return {
    event,
    body: {
      fields: [...fields.values()].map(f => ({ ...f, value: answers[f.key] ?? '', briefValue: fromBrief[f.key] ?? null, typed: typedKeys.has(f.key) })),
      templates: out,
      hasBrief: !!brief?.template,
    },
  };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const v = await view(auth.tenantId, params.id);
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(v.body);
}

const Put = z.object({
  // labelKey → words; null = use the client's brief again
  answers: z.record(z.string().max(500).nullable()).optional(),
  templates: z.array(z.object({
    id: z.string().min(1),
    paletteId: z.string().max(64).nullable().optional(),
    pairingId: z.string().max(64).nullable().optional(),
    adjust: z.record(TextAdjust).optional(),
  }).strict()).max(30).optional(),
}).strict();

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Put.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event?.genieSettings) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isLocked(event)) return lockedError();

  if (parsed.data.answers) {
    const current = TemplateTextAnswers.safeParse(event.genieSettings.templateText ?? {});
    const next: Record<string, string> = current.success ? { ...current.data } : {};
    for (const [k, v] of Object.entries(parsed.data.answers)) {
      const key = labelKey(k);
      if (!key) continue;
      if (v === null) delete next[key]; else next[key] = v;
    }
    if (Object.keys(next).length > 40) return NextResponse.json({ error: 'Too many text fields' }, { status: 400 });
    await prisma.eventGenieSettings.update({ where: { id: event.genieSettings.id }, data: { templateText: Object.keys(next).length ? next : Prisma.DbNull } });
  }

  for (const change of parsed.data.templates ?? []) {
    const t = await prisma.eventGenieTemplate.findFirst({ where: { id: change.id, eventId: event.id, tenantId: auth.tenantId } });
    if (!t) return NextResponse.json({ error: 'That template is no longer on this event.' }, { status: 404 });
    const opts = await textOptionsOf(t);
    if (change.paletteId && !opts.colorVariants.some(p => p.id === change.paletteId)) return NextResponse.json({ error: 'That palette is not in this template.' }, { status: 400 });
    if (change.pairingId && !opts.fontPairings.some(p => p.id === change.pairingId)) return NextResponse.json({ error: 'Those fonts are not in this template.' }, { status: 400 });
    const next: EventTextOptions = {
      ...opts,
      ...(change.paletteId !== undefined ? { paletteId: change.paletteId } : {}),
      ...(change.pairingId !== undefined ? { pairingId: change.pairingId } : {}),
      ...(change.adjust !== undefined ? { adjust: change.adjust } : {}),
    };
    await prisma.eventGenieTemplate.update({ where: { id: t.id }, data: { textOptions: EventTextOptions.parse(next) as Prisma.InputJsonValue } });
  }

  const v = await view(auth.tenantId, params.id);
  return NextResponse.json(v!.body);
}
