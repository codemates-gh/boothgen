export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { briefLibraryTemplate, libraryWhere } from '@/lib/genie/library';
import { isBoothClient, setUpGenie } from '@/lib/genie/boothEvents';
import { messagingRoutes } from '@/lib/genie/messaging';
import { IPADS_PER_PAYMENT, eventBilling, isComp } from '@/lib/genie/payments';
import { CUSTOM_FLAG, SECTION_NAMES, customFlags, getDefaults, sectionValues } from '@/lib/genie/defaults';
import { latestApprovedDesign } from '@/lib/genie/approvedDesign';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { bundleValidUntil, designApprovalPending, effectiveLockedAt, eventLocksAt, isValidTimeZone } from '@/lib/genie/bundle';
import { SettingsPatch, boomerangData, findAdminEvent, lockedError, providerWarnings, settingsUpdateData, settingsView, templateView, withBoomerangDesignProblem } from '@/lib/genie/eventAdmin';
import { galleryRetentionDates, getGalleryRetention } from '@/lib/gallery/retention';
import { attractData, deleteUnusedAttractMedia, storedAttract } from '@/lib/genie/attract';
import { countdownSoundData, deleteUnusedCountdownSounds, storedCountdownSound } from '@/lib/genie/countdownSound';
import { eventProps, propView, propsData } from '@/lib/genie/props';
import { backdropView, backdropsData, eventBackdrops } from '@/lib/genie/backdrops';
import { chosenPoses, poseView, posesData } from '@/lib/genie/poses';

// Everything the event's Genie dashboard shows
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [templates, messaging, retention, pending, approved, briefTemplate, defaults, chosenProps, chosenBackdrops, posesChosen] = await Promise.all([
    prisma.eventGenieTemplate.findMany({ where: { eventId: event.id, tenantId: auth.tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.genieMessagingConfig.findUnique({ where: { tenantId: auth.tenantId } }),
    getGalleryRetention(),
    designApprovalPending([event.id]),
    latestApprovedDesign(auth.tenantId, event.id),
    briefLibraryTemplate(auth.tenantId, event.id),
    getDefaults(auth.tenantId),
    event.genieSettings ? eventProps(event.genieSettings.propIds, auth.tenantId) : Promise.resolve([]),
    event.genieSettings ? eventBackdrops(event.genieSettings.backdropIds, auth.tenantId) : Promise.resolve([]),
    event.genieSettings ? chosenPoses(event.genieSettings.poseIds, auth.tenantId) : Promise.resolve([]),
  ]);
  const libIds = Array.from(new Set(templates.map(t => t.libraryTemplateId).filter((id): id is string => !!id)));
  const withAlternate = new Set((await prisma.boothDesignTemplate.findMany({
    where: { id: { in: libIds }, ...libraryWhere(auth.tenantId), alternateLayout: { not: Prisma.AnyNull } }, select: { id: true },
  })).map(t => t.id));
  const s = event.genieSettings;
  const photos = galleryRetentionDates(event.eventDate, retention);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { id: true, product: true, sharingStationOff: true } });
  const b = await eventBilling(tenant, event.id);
  // Receipt lines: completed payments, comps and refunds (event and Sharing station payments)
  const history = b.paysPerEvent || b.sharingStation || b.sharingPcsPaid > 0
    ? (await prisma.genieEventPayment.findMany({ where: { eventId: event.id, status: { in: ['paid', 'refunded', 'disputed'] } }, orderBy: { createdAt: 'asc' } }))
      .map(p => ({ amountCents: p.amountCents, status: p.status, paidAt: p.paidAt, comp: isComp(p), sharingPcs: p.sharingPcs, ipads: p.ipads }))
    : [];
  const sharing = {
    sharingAvailable: !tenant.sharingStationOff, sharingStation: b.sharingStation, sharingPcs: b.sharingPcs, sharingPcsPaid: b.sharingPcsPaid,
    sharingPcsDue: b.sharingPcsDue, sharingPcCents: b.sharingPcCents, amountDueCents: b.amountDueCents,
  };
  const billing = b.paysPerEvent
    ? { paysPerEvent: true, paid: b.paid, payments: b.payments, ipadsCovered: b.ipadsCovered, ipadsPerPayment: IPADS_PER_PAYMENT, priceCents: b.priceCents!, history, ...sharing }
    : { paysPerEvent: false, history, ...sharing };
  return NextResponse.json({
    event: { id: event.id, title: event.title, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime, venueName: event.venueName, boothEvent: isBoothClient(event.client) },
    settings: s ? await withBoomerangDesignProblem(settingsView(s), s) : null,
    billing,
    lockedAt: s ? effectiveLockedAt(event, s) : null,
    locksAt: eventLocksAt(event, s?.timeZone ?? 'America/New_York'),
    // 48 hours after the event ends iPads can no longer run it; it can still be viewed and duplicated
    expired: !!s && bundleValidUntil(event, s.timeZone).getTime() <= Date.now(),
    templates: templates.map(t => ({ ...templateView(t), alternateAvailable: !!t.libraryTemplateId && withAlternate.has(t.libraryTemplateId) })),
    providerWarnings: s ? providerWarnings(messaging, s, messagingRoutes(messaging, tenant)) : [],
    photosHiddenAt: photos.hiddenAt,
    photosDeletedAt: photos.deletedAt,
    designApprovalPending: pending.has(event.id),
    approvedDesign: approved ? { id: approved.id, version: approved.version, filename: approved.filename, approvedAt: approved.approvedAt } : null,
    briefTemplate: briefTemplate ? { id: briefTemplate.id, name: briefTemplate.name } : null,
    defaults: { saved: defaults.saved, timeZone: defaults.values.timeZone },
    // The event's props (including any Super Admin has since switched off), in the guests' order
    chosenProps: chosenProps.map(propView),
    chosenBackdrops: chosenBackdrops.map(backdropView),
    // The event's poses (including Standard ones switched off since), in the guests' order
    chosenPoses: posesChosen.map(poseView),
  });
}

const SetUp = z.object({ timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional() }).strict();

// Turns Genie on for the event with default settings
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = SetUp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (event.genieSettings) return NextResponse.json(settingsView(event.genieSettings));
  try {
    // Starts from the account's Genie defaults (or the built-in ones) and follows them until customized
    const s = await setUpGenie(auth.tenantId, event.id, parsed.data.timeZone);
    return NextResponse.json(settingsView(s), { status: 201 });
  } catch (err) {
    if ((err as any)?.code !== 'P2002') throw err;
    return NextResponse.json(settingsView(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })));
  }
}

export async function PATCH(req: NextRequest, props0: { params: Promise<{ id: string }> }) {
  const params = await props0.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = SettingsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: i?.path.join('.') }, { status: 400 });
  }
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const s = event.genieSettings;
  if (!s) return NextResponse.json({ error: 'Set up Genie for this event first', code: 'not_configured' }, { status: 409 });
  if (effectiveLockedAt(event, s)) return lockedError();

  // The Sharing station add-on can be switched off for an account by Super Admin
  if (parsed.data.sharingStation?.enabled && !s.sharingStationEnabled) {
    const t = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { sharingStationOff: true } });
    if (t?.sharingStationOff) return NextResponse.json({ error: "The Sharing station isn't available for your account. Contact support.", path: 'sharingStation' }, { status: 400 });
  }
  const result = settingsUpdateData(parsed.data, s);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (parsed.data.boomerang) {
    const b = await boomerangData(parsed.data.boomerang, s.boomerang, auth.tenantId);
    if ('error' in b) return NextResponse.json({ error: b.error, path: b.path ?? 'boomerang.overlayUrl' }, { status: 400 });
    result.data.boomerang = b.value;
  }
  if (parsed.data.capture?.countdownSound) {
    const c = await countdownSoundData(parsed.data.capture.countdownSound, s.countdownSound, auth.tenantId);
    if ('error' in c) return NextResponse.json({ error: c.error, path: 'capture.countdownSound' }, { status: 400 });
    result.data.countdownSound = c.value;
  }
  if (parsed.data.attract) {
    const a = await attractData(parsed.data.attract, s.attract, auth.tenantId);
    if ('error' in a) return NextResponse.json({ error: a.error, path: 'attract.mediaUrl' }, { status: 400 });
    Object.assign(result.data, a.data);
  }
  if (parsed.data.props) {
    const p = await propsData(parsed.data.props, s.propIds, auth.tenantId);
    if ('error' in p) return NextResponse.json({ error: p.error, path: 'props' }, { status: 400 });
    Object.assign(result.data, p.data);
  }
  if (parsed.data.backgroundRemoval) {
    const b = await backdropsData(parsed.data.backgroundRemoval, s.backdropIds, auth.tenantId);
    if ('error' in b) return NextResponse.json({ error: b.error, path: 'backgroundRemoval' }, { status: 400 });
    Object.assign(result.data, b.data);
  }
  if (parsed.data.poses) {
    const p = await posesData(parsed.data.poses, s.poseIds, auth.tenantId);
    if ('error' in p) return NextResponse.json({ error: p.error, path: 'poses' }, { status: 400 });
    Object.assign(result.data, p.data);
  }
  const defaults = (await getDefaults(auth.tenantId)).values;
  // Sections put back on the defaults
  for (const section of parsed.data.reset ?? []) Object.assign(result.data, sectionValues(defaults, section), { [CUSTOM_FLAG[section]]: false });
  let saved = await prisma.eventGenieSettings.update({ where: { id: s.id }, data: result.data });
  // Sections saved here are custom only when they now differ from the defaults
  const touched = SECTION_NAMES.filter(sec => (sec === 'printing' ? parsed.data.printing : parsed.data[sec]) !== undefined && !parsed.data.reset?.includes(sec));
  if (touched.length) saved = await prisma.eventGenieSettings.update({ where: { id: s.id }, data: customFlags(saved, defaults, touched) });
  // A replaced attract file nothing else uses is deleted
  const oldAttract = storedAttract(s.attract)?.media.url;
  if (oldAttract && oldAttract !== storedAttract(saved.attract)?.media.url) await deleteUnusedAttractMedia([oldAttract]);
  const customUrl = (v: unknown) => { const c = storedCountdownSound(v); return c?.style === 'custom' ? c.custom.url : null; };
  const oldSound = customUrl(s.countdownSound);
  if (oldSound && oldSound !== customUrl(saved.countdownSound)) await deleteUnusedCountdownSounds([oldSound]);
  return NextResponse.json(await withBoomerangDesignProblem(settingsView(saved), saved));
}
