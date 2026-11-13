import { createHash } from 'crypto';
import type { Event, EventGenieSettings, EventGenieTemplate, Gallery, GenieBackdrop, GenieMessagingConfig, GenieProp, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import type { StoredLayout } from './schemas';
import { galleryUrl, sessionUrl } from './urls';
import { emailUsable, smsConfigured } from './messaging';
import { bundleBoomerang } from './boomerang';
import { bundleAttract } from './attract';
import { bundleProps, eventProps } from './props';
import { bundleBackdrops, eventBackdrops } from './backdrops';
import { galleryRetentionDates, getGalleryRetention, type GalleryRetention } from '@/lib/gallery/retention';

export { appUrl, galleryUrl, sessionUrl } from './urls';

export const BUNDLE_SCHEMA_VERSION = '1.0';
const VALID_AFTER_END_MS = 24 * 3600 * 1000;

// Copy used when an event's Genie settings are first created
export const GENIE_SETTINGS_DEFAULTS = {
  smsBody: 'Hi {{firstName}}! Here are your photos from {{eventName}}: {{link}}',
  emailSubject: 'Your photos from {{eventName}}',
  emailBody: 'Hi {{firstName}},\n\nThanks for stopping by the booth! Your photos: {{link}}',
  smsConsentText: 'I agree to receive one text message with my photos. Msg & data rates may apply.',
};

// The event's gallery, created on first Genie use (same shape as the gallery page's auto-create)
export async function ensureGallery(event: Pick<Event, 'id' | 'tenantId' | 'title'>): Promise<Gallery> {
  const existing = await prisma.gallery.findUnique({ where: { eventId: event.id } });
  if (existing) return existing;
  try {
    return await prisma.gallery.create({ data: { tenantId: event.tenantId, eventId: event.id, title: event.title + ' Gallery' } });
  } catch (err) {
    if ((err as any)?.code === 'P2002') return prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    throw err;
  }
}

// Offset (ms) of a time zone from UTC at a given instant
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - at.getTime();
}

// Device may run the event offline until endTime (or the end of the event day in its time zone) + 24 h
export function bundleValidUntil(event: Pick<Event, 'eventDate' | 'endTime'>, timeZone: string): Date {
  if (event.endTime) return new Date(event.endTime.getTime() + VALID_AFTER_END_MS);
  const d = event.eventDate;
  const localMidnightNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const endOfDay = localMidnightNext - tzOffsetMs(timeZone, new Date(localMidnightNext));
  return new Date(endOfDay + VALID_AFTER_END_MS);
}

// Midnight at the start of the event day in the event's time zone (eventDate is stored at UTC midnight)
export function startOfEventDay(eventDate: Date, timeZone: string): Date {
  const midnight = Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate());
  return new Date(midnight - tzOffsetMs(timeZone, new Date(midnight)));
}

// The event's Genie setup locks when the event starts: startTime, else the start of the event day
export function eventLocksAt(event: Pick<Event, 'eventDate' | 'startTime'>, timeZone: string): Date {
  return event.startTime ?? startOfEventDay(event.eventDate, timeZone);
}

export function effectiveLockedAt(event: Pick<Event, 'eventDate' | 'startTime'>, settings: Pick<EventGenieSettings, 'lockedAt' | 'timeZone'>, now = new Date()): Date | null {
  if (settings.lockedAt) return settings.lockedAt;
  const at = eventLocksAt(event, settings.timeZone);
  return now >= at ? at : null;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function layoutJson(id: string, version: number, layout: StoredLayout) {
  return { id, version, ...layout };
}

function eventTemplateJson(t: EventGenieTemplate) {
  return {
    id: t.id,
    name: t.name,
    ...(t.thumbnail ? { thumbnail: t.thumbnail } : {}),
    layout: layoutJson(t.id, t.version, t.layout as unknown as StoredLayout),
    ...(t.alternateLayout ? { alternateLayout: layoutJson(t.id + '-alt', t.version, t.alternateLayout as unknown as StoredLayout) } : {}),
  };
}

type BundleEvent = Event & {
  client: { firstName: string; lastName: string };
  genieSettings: EventGenieSettings | null;
  genieTemplates: EventGenieTemplate[];
};

export type BundleResult =
  | { ok: true; bundle: Record<string, unknown>; bundleVersion: number }
  | { ok: false; status: 404 | 409; code: string; error: string };

function assemble(event: BundleEvent, settings: EventGenieSettings, gallery: Gallery, messaging: GenieMessagingConfig | null, retention: GalleryRetention, bundleVersion: number, props: GenieProp[], backdrops: GenieBackdrop[]) {
  const props_ = bundleProps(settings.propsEnabled, props);
  const backdrops_ = bundleBackdrops(settings, backdrops);
  const photos = galleryRetentionDates(event.eventDate, retention);
  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    bundleVersion,
    event: {
      id: event.id,
      title: event.title,
      clientName: `${event.client.firstName} ${event.client.lastName}`.trim(),
      eventDate: event.eventDate.toISOString(),
      ...(event.startTime ? { startTime: event.startTime.toISOString() } : {}),
      ...(event.endTime ? { endTime: event.endTime.toISOString() } : {}),
      timeZone: settings.timeZone,
      ...(event.venueName ? { venueName: event.venueName } : {}),
    },
    validUntil: bundleValidUntil(event, settings.timeZone).toISOString(),
    lockedAt: effectiveLockedAt(event, settings)?.toISOString() ?? null,
    capture: {
      shotCount: settings.shotCount,
      initialCountdownSeconds: settings.initialCountdownSeconds,
      betweenShotsCountdownSeconds: settings.betweenShotsCountdownSeconds,
      showPerShotPreview: settings.showPerShotPreview,
      allowPerShotRetake: settings.allowPerShotRetake,
      perShotPreviewSeconds: settings.perShotPreviewSeconds,
      allowReviewRetake: settings.allowReviewRetake,
      retakesPerShot: settings.retakesPerShot,
      idleTimeoutSeconds: settings.idleTimeoutSeconds,
      // Optional; left out until the operator sets them, so existing bundles (and their version) don't change
      ...(settings.lookAtCamera ? { lookAtCamera: settings.lookAtCamera } : {}),
      ...(settings.boomerang ? { boomerang: bundleBoomerang(settings.boomerang, settings.boomerangEdgeLight) } : {}),
    },
    templates: [...event.genieTemplates].sort((a, b) => a.sortOrder - b.sortOrder).map(eventTemplateJson),
    processing: settings.processing,
    filters: {
      guestFiltersEnabled: settings.guestFiltersEnabled,
      defaultFilterId: settings.defaultFilterId,
      filters: settings.filters,
    },
    sharing: {
      // A channel is only offered when the tenant's own provider for it is set up
      smsEnabled: settings.smsEnabled && smsConfigured(messaging),
      emailEnabled: settings.emailEnabled && emailUsable(messaging),
      qrEnabled: settings.qrEnabled,
      guestLinkScope: settings.guestLinkScope,
      smsBody: settings.smsBody,
      emailSubject: settings.emailSubject,
      emailBody: settings.emailBody,
      smsConsentText: settings.smsConsentText,
      galleryUrl: galleryUrl(gallery),
      sessionUrlTemplate: sessionUrl(gallery, '{token}'),
      // Same lifecycle as the gallery: links stop showing photos, then storage is deleted
      photosHiddenAt: photos.hiddenAt.toISOString(),
      photosDeletedAt: photos.deletedAt.toISOString(),
    },
    printing: {
      enabled: settings.printingEnabled,
      maxCopies: settings.printMaxCopies,
      defaultCopies: Math.min(settings.printDefaultCopies, settings.printMaxCopies),
    },
    // Optional; only when there's attract media, so it changes the version only when the media or delay changes
    ...(settings.attract ? { attract: bundleAttract(settings.attract, settings.attractReturnAfterSeconds) } : {}),
    // Optional; only when props are on and some are chosen (a replaced prop file changes the version)
    ...(props_ ? { props: props_ } : {}),
    // Optional; only when the virtual backdrop is on and some backdrops are chosen
    ...(backdrops_ ? { backgroundRemoval: backdrops_ } : {}),
  };
}

function contentHash(bundle: Record<string, unknown>): string {
  const { bundleVersion: _v, ...content } = bundle;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

// Builds the event bundle and bumps bundleVersion whenever its content changed since the last build
export async function buildEventBundle(tenantId: string, eventId: string): Promise<BundleResult> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId },
    include: { client: { select: { firstName: true, lastName: true } }, genieSettings: true, genieTemplates: true },
  });
  if (!event) return { ok: false, status: 404, code: 'not_found', error: 'Event not found' };
  let settings = event.genieSettings;
  if (!settings) return { ok: false, status: 409, code: 'not_configured', error: 'Genie settings have not been set up for this event' };
  if (!settings.enabled) return { ok: false, status: 409, code: 'not_configured', error: 'Genie is turned off for this event' };
  if (event.genieTemplates.length === 0) return { ok: false, status: 409, code: 'no_templates', error: 'The event has no Genie templates yet' };

  const gallery = await ensureGallery(event);
  const [messaging, retention, props, backdrops] = await Promise.all([
    prisma.genieMessagingConfig.findUnique({ where: { tenantId } }),
    getGalleryRetention(),
    settings.propsEnabled ? eventProps(settings.propIds, tenantId) : Promise.resolve([]),
    settings.backdropsEnabled ? eventBackdrops(settings.backdropIds, tenantId) : Promise.resolve([]),
  ]);
  let bundle = assemble(event, settings, gallery, messaging, retention, settings.bundleVersion, props, backdrops);
  const hash = contentHash(bundle);

  for (let attempt = 0; settings.bundleHash !== hash && attempt < 3; attempt++) {
    const data: Prisma.EventGenieSettingsUpdateManyMutationInput = settings.bundleHash === null
      ? { bundleHash: hash }
      : { bundleHash: hash, bundleVersion: { increment: 1 } };
    // Guarded on the previous hash so concurrent builds bump the version once
    await prisma.eventGenieSettings.updateMany({ where: { id: settings.id, bundleHash: settings.bundleHash }, data });
    settings = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { id: settings.id } });
  }
  bundle = { ...bundle, bundleVersion: settings.bundleVersion };
  return { ok: true, bundle, bundleVersion: settings.bundleVersion };
}

// "Client hasn't approved the design yet": the latest client design exists and isn't approved
export async function designApprovalPending(eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const designs = await prisma.templateDesign.findMany({
    where: { eventId: { in: eventIds } },
    orderBy: { version: 'desc' },
    select: { eventId: true, status: true },
  });
  const latest = new Map<string, string>();
  for (const d of designs) if (!latest.has(d.eventId)) latest.set(d.eventId, d.status);
  return new Set(Array.from(latest).filter(([, status]) => status !== 'APPROVED').map(([id]) => id));
}
