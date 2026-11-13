import type { Event, EventGenieSettings, GenieDefaults, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { GENIE_SETTINGS_DEFAULTS, effectiveLockedAt } from './bundle';

// Sections that have account-wide defaults. Field names are the same on GenieDefaults and EventGenieSettings.
export const DEFAULT_SECTIONS = {
  timeZone: ['timeZone'],
  capture: ['shotCount', 'initialCountdownSeconds', 'betweenShotsCountdownSeconds', 'showPerShotPreview', 'allowPerShotRetake', 'perShotPreviewSeconds', 'allowReviewRetake', 'retakesPerShot', 'idleTimeoutSeconds', 'boomerangEdgeLight'],
  sharing: ['smsEnabled', 'emailEnabled', 'qrEnabled', 'guestLinkScope', 'smsBody', 'emailSubject', 'emailBody', 'smsConsentText'],
  printing: ['printingEnabled', 'printMaxCopies', 'printDefaultCopies'],
} as const;
export type DefaultSection = keyof typeof DEFAULT_SECTIONS;
export const SECTION_NAMES = Object.keys(DEFAULT_SECTIONS) as DefaultSection[];

export const CUSTOM_FLAG: Record<DefaultSection, 'customTimeZone' | 'customCapture' | 'customSharing' | 'customPrinting'> = {
  timeZone: 'customTimeZone', capture: 'customCapture', sharing: 'customSharing', printing: 'customPrinting',
};

type DefaultsValues = Omit<GenieDefaults, 'id' | 'tenantId' | 'templateIds' | 'createdAt' | 'updatedAt'>;

// Built-in values used until the account saves its own defaults
export const BUILT_IN_DEFAULTS: DefaultsValues = {
  timeZone: 'America/New_York',
  shotCount: 3, initialCountdownSeconds: 5, betweenShotsCountdownSeconds: 3, showPerShotPreview: true, allowPerShotRetake: true,
  perShotPreviewSeconds: 2, allowReviewRetake: false, retakesPerShot: 1, idleTimeoutSeconds: 60, boomerangEdgeLight: true,
  smsEnabled: true, emailEnabled: true, qrEnabled: true, guestLinkScope: 'own', ...GENIE_SETTINGS_DEFAULTS,
  printingEnabled: true, printMaxCopies: 4, printDefaultCopies: 1,
};

export async function getDefaults(tenantId: string): Promise<{ values: DefaultsValues; templateIds: string[]; saved: boolean }> {
  const row = await prisma.genieDefaults.findUnique({ where: { tenantId } });
  if (!row) return { values: BUILT_IN_DEFAULTS, templateIds: [], saved: false };
  const { id: _i, tenantId: _t, templateIds, createdAt: _c, updatedAt: _u, ...values } = row;
  return { values, templateIds: Array.isArray(templateIds) ? (templateIds as string[]) : [], saved: true };
}

export function sectionValues(src: Record<string, unknown>, section: DefaultSection): Record<string, unknown> {
  return Object.fromEntries(DEFAULT_SECTIONS[section].map(k => [k, src[k]]));
}

export function sameSection(a: Record<string, unknown>, b: Record<string, unknown>, section: DefaultSection): boolean {
  return DEFAULT_SECTIONS[section].every(k => a[k] === b[k]);
}

// Settings for a new event: every section from the defaults, none customized
export function newEventSettingsData(defaults: DefaultsValues, timeZone?: string) {
  return {
    ...defaults,
    ...(timeZone ? { timeZone } : {}),
    customTimeZone: !!timeZone && timeZone !== defaults.timeZone,
    customCapture: false, customSharing: false, customPrinting: false,
  };
}

// Copies changed default sections into every event that follows them and hasn't started (locked)
export async function applyDefaultsToEvents(tenantId: string, defaults: DefaultsValues, sections: DefaultSection[]): Promise<number> {
  if (sections.length === 0) return 0;
  const rows = await prisma.eventGenieSettings.findMany({
    where: { tenantId, OR: sections.map(s => ({ [CUSTOM_FLAG[s]]: false })) },
    include: { event: { select: { eventDate: true, startTime: true } } },
  });
  let updated = 0;
  for (const s of rows) {
    if (effectiveLockedAt(s.event as Pick<Event, 'eventDate' | 'startTime'>, s)) continue;
    const data: Prisma.EventGenieSettingsUpdateInput = {};
    for (const section of sections) {
      if (!s[CUSTOM_FLAG[section]]) Object.assign(data, sectionValues(defaults, section));
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.eventGenieSettings.update({ where: { id: s.id }, data });
    updated++;
  }
  return updated;
}

// After an event save: a section counts as custom when it differs from the defaults
export function customFlags(saved: EventGenieSettings, defaults: DefaultsValues, sections: DefaultSection[]) {
  return Object.fromEntries(sections.map(s => [CUSTOM_FLAG[s], !sameSection(saved as unknown as Record<string, unknown>, defaults as unknown as Record<string, unknown>, s)]));
}
