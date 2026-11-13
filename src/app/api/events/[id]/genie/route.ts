export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { briefLibraryTemplate, copyToEvent, findLibraryTemplate, libraryWhere } from '@/lib/genie/library';
import { applyApprovedDesignToGenie } from '@/lib/genie/autoApplyDesign';
import { CUSTOM_FLAG, SECTION_NAMES, customFlags, getDefaults, newEventSettingsData, sectionValues } from '@/lib/genie/defaults';
import { latestApprovedDesign } from '@/lib/genie/approvedDesign';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { designApprovalPending, effectiveLockedAt, eventLocksAt, isValidTimeZone } from '@/lib/genie/bundle';
import { SettingsPatch, boomerangData, findAdminEvent, lockedError, providerWarnings, settingsUpdateData, settingsView, templateView } from '@/lib/genie/eventAdmin';
import { galleryRetentionDates, getGalleryRetention } from '@/lib/gallery/retention';
import { attractData, deleteUnusedAttractMedia, storedAttract } from '@/lib/genie/attract';

// Everything the event's Genie dashboard shows
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [templates, messaging, retention, pending, approved, briefTemplate, defaults] = await Promise.all([
    prisma.eventGenieTemplate.findMany({ where: { eventId: event.id, tenantId: auth.tenantId }, orderBy: { sortOrder: 'asc' } }),
    prisma.genieMessagingConfig.findUnique({ where: { tenantId: auth.tenantId } }),
    getGalleryRetention(),
    designApprovalPending([event.id]),
    latestApprovedDesign(auth.tenantId, event.id),
    briefLibraryTemplate(auth.tenantId, event.id),
    getDefaults(auth.tenantId),
  ]);
  const libIds = Array.from(new Set(templates.map(t => t.libraryTemplateId).filter((id): id is string => !!id)));
  const withAlternate = new Set((await prisma.boothDesignTemplate.findMany({
    where: { id: { in: libIds }, ...libraryWhere(auth.tenantId), alternateLayout: { not: Prisma.AnyNull } }, select: { id: true },
  })).map(t => t.id));
  const s = event.genieSettings;
  const photos = galleryRetentionDates(event.eventDate, retention);
  return NextResponse.json({
    event: { id: event.id, title: event.title, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime },
    settings: s ? settingsView(s) : null,
    lockedAt: s ? effectiveLockedAt(event, s) : null,
    locksAt: eventLocksAt(event, s?.timeZone ?? 'America/New_York'),
    templates: templates.map(t => ({ ...templateView(t), alternateAvailable: !!t.libraryTemplateId && withAlternate.has(t.libraryTemplateId) })),
    providerWarnings: s ? providerWarnings(messaging, s) : [],
    photosHiddenAt: photos.hiddenAt,
    photosDeletedAt: photos.deletedAt,
    designApprovalPending: pending.has(event.id),
    approvedDesign: approved ? { id: approved.id, version: approved.version, filename: approved.filename, approvedAt: approved.approvedAt } : null,
    briefTemplate: briefTemplate ? { id: briefTemplate.id, name: briefTemplate.name } : null,
    defaults: { saved: defaults.saved, timeZone: defaults.values.timeZone },
  });
}

const SetUp = z.object({ timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional() }).strict();

// Turns Genie on for the event with default settings
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = SetUp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (event.genieSettings) return NextResponse.json(settingsView(event.genieSettings));
  try {
    // Starts from the account's Genie defaults (or the built-in ones) and follows them until customized
    const defaults = await getDefaults(auth.tenantId);
    const s = await prisma.eventGenieSettings.create({ data: { tenantId: auth.tenantId, eventId: event.id, ...newEventSettingsData(defaults.values, parsed.data.timeZone) } });
    // Templates: the layout the client picked in their design brief first, then the account's default templates
    if ((await prisma.eventGenieTemplate.count({ where: { eventId: event.id } })) === 0) {
      const picked = await briefLibraryTemplate(auth.tenantId, event.id);
      const added = new Set<string>();
      for (const lib of [picked, ...await Promise.all(defaults.templateIds.map(id => findLibraryTemplate(auth.tenantId, id)))]) {
        if (!lib || added.has(lib.id)) continue;
        const r = await copyToEvent(auth.tenantId, event.id, lib, !!lib.alternateLayout);
        if (!('error' in r)) added.add(lib.id);
      }
    }
    // A design the client already approved goes on their chosen layout
    await applyApprovedDesignToGenie(auth.tenantId, event.id).catch(e => console.error('[genie-setup] auto-apply failed:', e));
    return NextResponse.json(settingsView(s), { status: 201 });
  } catch (err) {
    if ((err as any)?.code !== 'P2002') throw err;
    return NextResponse.json(settingsView(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const result = settingsUpdateData(parsed.data, s);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (parsed.data.boomerang) {
    const b = await boomerangData(parsed.data.boomerang, s.boomerang, auth.tenantId);
    if ('error' in b) return NextResponse.json({ error: b.error, path: 'boomerang.overlayUrl' }, { status: 400 });
    result.data.boomerang = b.value;
  }
  if (parsed.data.attract) {
    const a = await attractData(parsed.data.attract, s.attract, auth.tenantId);
    if ('error' in a) return NextResponse.json({ error: a.error, path: 'attract.mediaUrl' }, { status: 400 });
    Object.assign(result.data, a.data);
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
  return NextResponse.json(settingsView(saved));
}
