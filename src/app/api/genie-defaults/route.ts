export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { SettingsPatch } from '@/lib/genie/eventAdmin';
import { DefaultSection, SECTION_NAMES, applyDefaultsToEvents, getDefaults, sameSection } from '@/lib/genie/defaults';
import { findLibraryTemplate, libraryView } from '@/lib/genie/library';

function view(d: Awaited<ReturnType<typeof getDefaults>>) {
  const v = d.values;
  return {
    saved: d.saved,
    timeZone: v.timeZone,
    capture: {
      shotCount: v.shotCount, initialCountdownSeconds: v.initialCountdownSeconds, betweenShotsCountdownSeconds: v.betweenShotsCountdownSeconds,
      showPerShotPreview: v.showPerShotPreview, allowPerShotRetake: v.allowPerShotRetake, perShotPreviewSeconds: v.perShotPreviewSeconds,
      allowReviewRetake: v.allowReviewRetake, retakesPerShot: v.retakesPerShot, idleTimeoutSeconds: v.idleTimeoutSeconds,
    },
    sharing: {
      smsEnabled: v.smsEnabled, emailEnabled: v.emailEnabled, qrEnabled: v.qrEnabled, guestLinkScope: v.guestLinkScope as 'own' | 'all',
      smsBody: v.smsBody, emailSubject: v.emailSubject, emailBody: v.emailBody, smsConsentText: v.smsConsentText,
    },
    printing: { enabled: v.printingEnabled, maxCopies: v.printMaxCopies, defaultCopies: v.printDefaultCopies },
    templateIds: d.templateIds,
  };
}

export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const d = await getDefaults(auth.tenantId);
  const templates = (await Promise.all(d.templateIds.map(id => findLibraryTemplate(auth.tenantId, id)))).filter(Boolean).map(t => libraryView(t!));
  // Events that follow at least one default section
  const eventsFollowing = await prisma.eventGenieSettings.count({
    where: { tenantId: auth.tenantId, OR: [{ customTimeZone: false }, { customCapture: false }, { customSharing: false }, { customPrinting: false }] },
  });
  return NextResponse.json({ ...view(d), templates, eventsFollowing });
}

const shape = SettingsPatch.shape;
const Body = z.object({
  timeZone: shape.timeZone.unwrap(),
  capture: shape.capture.unwrap(),
  sharing: shape.sharing.unwrap(),
  printing: shape.printing.unwrap(),
  templateIds: z.array(z.string().min(1)).max(20),
}).partial().strict();

// Saves the defaults and updates every event still following the changed sections (not started yet)
export async function PUT(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: i?.path.join('.') }, { status: 400 });
  }
  const b = parsed.data;
  if (b.templateIds) {
    if (new Set(b.templateIds).size !== b.templateIds.length) return NextResponse.json({ error: 'A template is listed twice' }, { status: 400 });
    for (const id of b.templateIds) {
      if (!(await findLibraryTemplate(auth.tenantId, id))) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
  }
  const before = await getDefaults(auth.tenantId);
  const data = {
    ...(b.timeZone ? { timeZone: b.timeZone } : {}),
    ...(b.capture ?? {}),
    ...(b.sharing ?? {}),
    ...(b.printing ? { printingEnabled: b.printing.enabled, printMaxCopies: b.printing.maxCopies, printDefaultCopies: b.printing.defaultCopies } : {}),
    ...(b.templateIds ? { templateIds: b.templateIds } : {}),
  };
  await prisma.genieDefaults.upsert({
    where: { tenantId: auth.tenantId },
    create: { tenantId: auth.tenantId, ...before.values, ...data },
    update: data,
  });
  const after = await getDefaults(auth.tenantId);
  const changed = SECTION_NAMES.filter((s: DefaultSection) => !sameSection(before.values as any, after.values as any, s));
  const eventsUpdated = await applyDefaultsToEvents(auth.tenantId, after.values, changed);
  return NextResponse.json({ ...view(after), eventsUpdated });
}
