export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { SettingsPatch } from '@/lib/genie/eventAdmin';
import { DefaultSection, SECTION_NAMES, applyDefaultsToEvents, getDefaults, sameSection } from '@/lib/genie/defaults';
import { findLibraryTemplate, libraryView } from '@/lib/genie/library';
import { attractData, attractView, deleteUnusedAttractMedia, storedAttract } from '@/lib/genie/attract';
import { countdownSoundData, countdownSoundView, deleteUnusedCountdownSounds, storedCountdownSound } from '@/lib/genie/countdownSound';
import { chosenPoses, poseView, posesData, posesView } from '@/lib/genie/poses';

function view(d: Awaited<ReturnType<typeof getDefaults>>) {
  const v = d.values;
  return {
    saved: d.saved,
    timeZone: v.timeZone,
    capture: {
      shotCount: v.shotCount, initialCountdownSeconds: v.initialCountdownSeconds, betweenShotsCountdownSeconds: v.betweenShotsCountdownSeconds,
      showPerShotPreview: v.showPerShotPreview, allowPerShotRetake: v.allowPerShotRetake, perShotPreviewSeconds: v.perShotPreviewSeconds,
      allowReviewRetake: v.allowReviewRetake, retakesPerShot: v.retakesPerShot, idleTimeoutSeconds: v.idleTimeoutSeconds,
      boomerangEdgeLight: v.boomerangEdgeLight,
      thankYouSeconds: v.thankYouSeconds, thankYouTitle: v.thankYouTitle, thankYouSubtitle: v.thankYouSubtitle,
      startScreenGenieLogo: v.startScreenGenieLogo,
      countdownSound: countdownSoundView(v.countdownSound),
    },
    sharing: {
      smsEnabled: v.smsEnabled, emailEnabled: v.emailEnabled, qrEnabled: v.qrEnabled, guestLinkScope: v.guestLinkScope as 'own' | 'all',
      smsBody: v.smsBody, emailSubject: v.emailSubject, emailBody: v.emailBody, smsConsentText: v.smsConsentText,
    },
    printing: { enabled: v.printingEnabled, maxCopies: v.printMaxCopies, defaultCopies: v.printDefaultCopies, copiesMatchPeople: v.printCopiesMatchPeople },
    attract: attractView(v.attract, v.attractReturnAfterSeconds),
    poses: posesView(v),
    gallery: { uploadAll: v.sharingUploadAll, autoPublish: v.galleryAutoPublish },
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
    where: { tenantId: auth.tenantId, OR: [{ customTimeZone: false }, { customCapture: false }, { customSharing: false }, { customPrinting: false }, { customAttract: false }, { customPoses: false }] },
  });
  // The default poses (including Standard ones switched off since), in the guests' order
  const poses = (await chosenPoses(d.values.poseIds, auth.tenantId)).map(poseView);
  return NextResponse.json({ ...view(d), templates, eventsFollowing, chosenPoses: poses });
}

const shape = SettingsPatch.shape;
const Body = z.object({
  timeZone: shape.timeZone.unwrap(),
  capture: shape.capture.unwrap(),
  sharing: shape.sharing.unwrap(),
  printing: shape.printing.unwrap(),
  attract: shape.attract.unwrap(),
  poses: shape.poses.unwrap(),
  gallery: shape.gallery.unwrap(),
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
  let attract = {};
  if (b.attract) {
    const a = await attractData(b.attract, before.values.attract, auth.tenantId);
    if ('error' in a) return NextResponse.json({ error: a.error, path: 'attract.mediaUrl' }, { status: 400 });
    attract = a.data;
  }
  let countdown = {};
  const { countdownSound: soundPatch, ...capture } = b.capture ?? {};
  if (soundPatch) {
    const c = await countdownSoundData(soundPatch, before.values.countdownSound, auth.tenantId);
    if ('error' in c) return NextResponse.json({ error: c.error, path: 'capture.countdownSound' }, { status: 400 });
    countdown = { countdownSound: c.value };
  }
  let poses = {};
  if (b.poses) {
    const p = await posesData(b.poses, before.values.poseIds, auth.tenantId);
    if ('error' in p) return NextResponse.json({ error: p.error, path: 'poses' }, { status: 400 });
    poses = p.data;
  }
  const data = {
    ...(b.timeZone ? { timeZone: b.timeZone } : {}),
    ...capture,
    ...countdown,
    ...(b.sharing ?? {}),
    ...(b.printing ? { printingEnabled: b.printing.enabled, printMaxCopies: b.printing.maxCopies, printDefaultCopies: b.printing.defaultCopies, ...(b.printing.copiesMatchPeople !== undefined ? { printCopiesMatchPeople: b.printing.copiesMatchPeople } : {}) } : {}),
    ...attract,
    ...poses,
    ...(b.gallery ? { sharingUploadAll: b.gallery.uploadAll, galleryAutoPublish: b.gallery.autoPublish } : {}),
    ...(b.templateIds ? { templateIds: b.templateIds } : {}),
  };
  await prisma.genieDefaults.upsert({
    where: { tenantId: auth.tenantId },
    create: { tenantId: auth.tenantId, ...before.values, attract: before.values.attract ?? Prisma.DbNull, countdownSound: before.values.countdownSound ?? Prisma.DbNull, poseIds: (before.values.poseIds ?? []) as Prisma.InputJsonValue, ...data },
    update: data,
  });
  const after = await getDefaults(auth.tenantId);
  const changed = SECTION_NAMES.filter((s: DefaultSection) => !sameSection(before.values as any, after.values as any, s));
  const eventsUpdated = await applyDefaultsToEvents(auth.tenantId, after.values, changed);
  // The replaced attract file is deleted once no event uses it any more
  const oldAttract = storedAttract(before.values.attract)?.media.url;
  if (oldAttract && oldAttract !== storedAttract(after.values.attract)?.media.url) await deleteUnusedAttractMedia([oldAttract]);
  const customUrl = (v: unknown) => { const c = storedCountdownSound(v); return c?.style === 'custom' ? c.custom.url : null; };
  const oldSound = customUrl(before.values.countdownSound);
  if (oldSound && oldSound !== customUrl(after.values.countdownSound)) await deleteUnusedCountdownSounds([oldSound]);
  return NextResponse.json({ ...view(after), eventsUpdated, chosenPoses: (await chosenPoses(after.values.poseIds, auth.tenantId)).map(poseView) });
}
