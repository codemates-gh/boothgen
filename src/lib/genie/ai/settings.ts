import { prisma } from '@/lib/prisma/client';

// Geniefied (AI photo booth, Genie P13) settings Super Admin changes in Genie Usage, with no code change. The add-on's
// price per event is the add-on price (src/lib/genie/addOns.ts, 'geniefied').

export const AI_SETTING_KEYS = {
  ready: 'geniefied_ready',                     // on: operators can turn Geniefied on (off until G is ready)
  rendersIncluded: 'ai_renders_included',       // renders the paid add-on includes per event
  topUpRenders: 'ai_topup_renders',             // renders in a top-up pack
  topUpPriceCents: 'ai_topup_price_cents',      // price of a top-up pack
  trialRenders: 'ai_trial_renders',             // renders an event gets before the add-on is paid (watermarked)
  fastModel: 'ai_fast_model',                   // 1–2 faces
  qualityModel: 'ai_quality_model',             // 0 or 3+ faces
  fastCostCents: 'ai_fast_cost_cents',          // estimated provider cost per render, for the usage ledger
  qualityCostCents: 'ai_quality_cost_cents',
} as const;

export type AiSettings = {
  ready: boolean; rendersIncluded: number; topUpRenders: number; topUpPriceCents: number; trialRenders: number;
  fastModel: string; qualityModel: string; fastCostCents: number; qualityCostCents: number;
};

// G's starting values (2026-11-19): $29 per event with 100 renders (the price is the add-on's), top-ups of 100 for $19,
// 20 trial renders. Models: Google's "Nano Banana" class on the Gemini paid tier (not Gemini 2.5 Flash Image, shut down
// 2027-03-15); costs are estimates from Google's price list (≈ $0.04 fast, ≈ $0.13 quality per image).
export const AI_DEFAULTS: AiSettings = {
  ready: false, rendersIncluded: 100, topUpRenders: 100, topUpPriceCents: 1900, trialRenders: 20,
  fastModel: 'gemini-3.1-flash-image', qualityModel: 'gemini-3-pro-image-preview', fastCostCents: 4, qualityCostCents: 13,
};

const int = (v: string | undefined, fallback: number, min = 0) => { const n = Number(v); return v !== undefined && Number.isInteger(n) && n >= min ? n : fallback; };

export async function aiSettings(): Promise<AiSettings> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: Object.values(AI_SETTING_KEYS) } } });
  const m = new Map(rows.map(r => [r.key, r.value]));
  const k = AI_SETTING_KEYS, d = AI_DEFAULTS;
  return {
    ready: m.get(k.ready) === 'on',
    rendersIncluded: int(m.get(k.rendersIncluded), d.rendersIncluded, 1),
    topUpRenders: int(m.get(k.topUpRenders), d.topUpRenders, 1),
    topUpPriceCents: int(m.get(k.topUpPriceCents), d.topUpPriceCents, 50),
    trialRenders: int(m.get(k.trialRenders), d.trialRenders),
    fastModel: m.get(k.fastModel)?.trim() || d.fastModel,
    qualityModel: m.get(k.qualityModel)?.trim() || d.qualityModel,
    fastCostCents: int(m.get(k.fastCostCents), d.fastCostCents),
    qualityCostCents: int(m.get(k.qualityCostCents), d.qualityCostCents),
  };
}

export async function saveAiSettings(patch: Partial<AiSettings>) {
  const put = (key: string, value: string) => prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  const k = AI_SETTING_KEYS;
  await Promise.all(Object.entries(patch).map(([name, v]) => v === undefined ? null
    : put(k[name as keyof typeof k], name === 'ready' ? (v ? 'on' : 'off') : String(v))));
}

// Always first in every prompt; operators can't change it (G, P13 plan)
export const PROMPT_PREAMBLE =
  'Restyle this photo booth photo. Keep every person in it: the same number of people, each with the same face, ' +
  'identity, skin tone, age, body and pose, clearly recognizable. Keep the composition and framing. ' +
  'Do not add any text, letters, logos or watermarks. No nudity, no suggestive or violent content. ' +
  'Return one finished image.';

export const DEFAULT_CONSENT_TEXT =
  'Your photo will be sent to our AI provider to create your Geniefied image. ' +
  "I'm 18 or older, or a parent or guardian is with me.";

export const DEFAULT_READY_TEXT = 'Your Geniefied photo from {{eventName}} is ready: {{link}}';
export const READY_SUBJECT = 'Your Geniefied photo is ready';
