import { createHash } from 'crypto';
import type { Event, EventGenieSettings, EventGenieTemplate, Gallery, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import type { StoredLayout } from './schemas';

export const BUNDLE_SCHEMA_VERSION = '1.0';
const VALID_AFTER_END_MS = 24 * 3600 * 1000;

// Copy used when an event's Genie settings are first created
export const GENIE_SETTINGS_DEFAULTS = {
  smsBody: 'Hi {{firstName}}! Here are your photos from {{eventName}}: {{link}}',
  emailSubject: 'Your photos from {{eventName}}',
  emailBody: 'Hi {{firstName}},\n\nThanks for stopping by the booth! Your photos: {{link}}',
  smsConsentText: 'I agree to receive one text message with my photos. Msg & data rates may apply.',
};

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com').replace(/\/$/, '');
}

export function galleryUrl(gallery: Pick<Gallery, 'clientToken'>): string {
  return `${appUrl()}/g/${gallery.clientToken}`;
}

export function sessionUrl(gallery: Pick<Gallery, 'clientToken'>, publicToken: string): string {
  return `${galleryUrl(gallery)}/s/${publicToken}`;
}

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

function assemble(event: BundleEvent, settings: EventGenieSettings, gallery: Gallery, bundleVersion: number) {
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
    lockedAt: settings.lockedAt ? settings.lockedAt.toISOString() : null,
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
    },
    templates: [...event.genieTemplates].sort((a, b) => a.sortOrder - b.sortOrder).map(eventTemplateJson),
    processing: settings.processing,
    filters: {
      guestFiltersEnabled: settings.guestFiltersEnabled,
      defaultFilterId: settings.defaultFilterId,
      filters: settings.filters,
    },
    sharing: {
      smsEnabled: settings.smsEnabled,
      emailEnabled: settings.emailEnabled,
      qrEnabled: settings.qrEnabled,
      guestLinkScope: settings.guestLinkScope,
      smsBody: settings.smsBody,
      emailSubject: settings.emailSubject,
      emailBody: settings.emailBody,
      smsConsentText: settings.smsConsentText,
      galleryUrl: galleryUrl(gallery),
      sessionUrlTemplate: sessionUrl(gallery, '{token}'),
    },
    printing: {
      enabled: settings.printingEnabled,
      maxCopies: settings.printMaxCopies,
      defaultCopies: Math.min(settings.printDefaultCopies, settings.printMaxCopies),
    },
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
  if (event.genieTemplates.length === 0) return { ok: false, status: 409, code: 'no_templates', error: 'The event has no Genie templates yet' };

  const gallery = await ensureGallery(event);
  let bundle = assemble(event, settings, gallery, settings.bundleVersion);
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
