import { z } from 'zod';
import type { EventGenieSettings } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { DEFAULT_CONSENT_TEXT, DEFAULT_READY_TEXT } from './settings';
import { eventThemes, storedThemeIds, themeAsset } from './themes';

// The event's Geniefied section (Genie P13) and EventBundle.aiBooth (Genie shared/schemas/AiBoothConfig.json)

export const AI_MODES = ['beforeStart', 'fixedTheme', 'afterReview'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const AiBoothPatch = z.object({
  enabled: z.boolean(),
  mode: z.enum(AI_MODES),
  themeIds: z.array(z.string().min(1).max(80)).max(30, 'At most 30 themes'),
  fixedThemeId: z.string().min(1).max(80).nullable(),
  // null = BoothGen's default wording
  consentText: z.string().trim().min(1, "The consent text can't be empty").max(600, 'Keep the consent text to 600 characters').nullable(),
  waitSeconds: z.number().int().min(15, 'Wait 15 to 120 seconds').max(120, 'Wait 15 to 120 seconds'),
  readyText: z.string().trim().min(1, "The ready message can't be empty").max(500, 'Keep the ready message to 500 characters').nullable(),
}).strict();
export type AiBoothPatch = z.infer<typeof AiBoothPatch>;

// Checks the themes against the account's library; the fixed theme must be one of them
export async function aiBoothData(p: AiBoothPatch, tenantId: string): Promise<{ data: Partial<EventGenieSettings> } | { error: string }> {
  const ids = [...new Set(p.themeIds)];
  if (ids.length) {
    const found = await prisma.genieAiTheme.count({ where: { id: { in: ids }, OR: [{ tenantId: null, isActive: true }, { tenantId }] } });
    if (found !== ids.length) return { error: "Some of those themes aren't in your library" };
  }
  if (p.enabled && !ids.length) return { error: 'Choose at least one theme for Geniefied' };
  if (p.mode === 'fixedTheme' && (!p.fixedThemeId || !ids.includes(p.fixedThemeId))) return { error: 'Choose the theme everyone gets' };
  return {
    data: {
      aiEnabled: p.enabled, aiMode: p.mode, aiThemeIds: ids as never, aiFixedThemeId: p.mode === 'fixedTheme' ? p.fixedThemeId : null,
      aiConsentText: p.consentText, aiWaitSeconds: p.waitSeconds, aiReadyText: p.readyText,
    },
  };
}

export function aiBoothView(s: EventGenieSettings) {
  return {
    enabled: s.aiEnabled, mode: s.aiMode as AiMode, themeIds: storedThemeIds(s.aiThemeIds), fixedThemeId: s.aiFixedThemeId,
    consentText: s.aiConsentText, waitSeconds: s.aiWaitSeconds, readyText: s.aiReadyText,
  };
}

export const consentTextFor = (s: Pick<EventGenieSettings, 'aiConsentText'>) => s.aiConsentText?.trim() || DEFAULT_CONSENT_TEXT;
export const readyTextFor = (s: Pick<EventGenieSettings, 'aiReadyText'>) => s.aiReadyText?.trim() || DEFAULT_READY_TEXT;

// EventBundle.aiBooth: only while Geniefied is available (Super Admin) and on for the event with a theme that has a
// sample. A fixed theme that's gone falls back to the guests' choice. rendersLeft is left out: it changes with every
// render and would change the bundle version (the render answer carries it).
export async function bundleAiBooth(s: EventGenieSettings, tenantId: string, available: boolean) {
  if (!available || !s.aiEnabled) return undefined;
  const themes = (await eventThemes(s.aiThemeIds, tenantId)).map(themeAsset).filter((t): t is NonNullable<ReturnType<typeof themeAsset>> => !!t);
  if (!themes.length) return undefined;
  const fixed = s.aiMode === 'fixedTheme' && themes.some(t => t.id === s.aiFixedThemeId) ? s.aiFixedThemeId! : null;
  const mode = s.aiMode === 'fixedTheme' && !fixed ? 'beforeStart' : s.aiMode as AiMode;
  return {
    enabled: true, mode, themes, ...(fixed ? { fixedThemeId: fixed } : {}),
    consentText: consentTextFor(s).slice(0, 600),
    ...(s.aiWaitSeconds !== 45 ? { waitSeconds: Math.min(120, Math.max(15, s.aiWaitSeconds)) } : {}),
  };
}
