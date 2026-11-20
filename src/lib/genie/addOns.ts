import type { EventGenieSettings } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

// Paid per-event Genie add-ons (2.114.0). An add-on is "in use" when the event's settings use it (e.g. a Glamour Style
// filter); it's then charged with the event, in the same checkout (or its own checkout when the event is already paid
// or the account doesn't pay per event). Until it's paid the event runs watermarked, as an unpaid Genie event does
// (G, 2026-11-19), so an add-on reaches the iPad only on an event that pays for it or shows the watermark.
// Prices: Super Admin → Genie Usage ($15 for Glamour Style until changed there).

export type AddOnId = 'glamourStyle' | 'geniefied' | 'genie360';

type Settings = Pick<EventGenieSettings, 'processing' | 'filters' | 'aiEnabled'> & Partial<Pick<EventGenieSettings, 'spin360'>>;

export const GLAMOUR_STYLE_URL = 'https://www.glamourstylephotobooth.com';

export const ADD_ONS: { id: AddOnId; name: string; description: string; setting: string; defaultCents: number; inUse: (s: Settings) => boolean }[] = [
  {
    id: 'glamourStyle',
    name: 'Glamour Style',
    // Glamour Style Photo Booth's exclusive filter, offered through a partnership with Booth Genius (G, 2026-11-19)
    description: 'The exclusive filter from our partner Glamour Style Photo Booth: advanced skin-smoothing that keeps what makes each person recognizable, like professional retouching delivered instantly.',
    setting: 'addon_price_cents_glamour_style',
    defaultCents: 1500,
    // The glamourStyle step only (the free Beautify filter is the beautify step)
    inUse: s => hasStep(s.processing, 'glamourStyle') || filterList(s.filters).some(f => hasStep(f.steps, 'glamourStyle')),
  },
  {
    id: 'geniefied',
    name: 'Geniefied',
    // Genie P13: the AI photo booth. Paying adds the included renders (src/lib/genie/ai/settings.ts); top-ups add more
    description: 'Geniefied, the AI photo booth: guests restyle their photos in themes you choose.',
    setting: 'addon_price_cents_geniefied',
    defaultCents: 2900,
    inUse: s => s.aiEnabled,
  },
  {
    id: 'genie360',
    name: 'Genie 360',
    // Genie P15: the 360 spinner booth (an iPhone on the arm). No render allowance: editing runs on the iPhone
    description: 'Genie 360, the spinner booth: an iPhone on the arm records, edits and shares slow-motion 360 videos.',
    setting: 'addon_price_cents_genie360',
    defaultCents: 2500,
    inUse: s => (s.spin360 as { enabled?: unknown } | null | undefined)?.enabled === true,
  },
];

export const addOnName = (id: string) => ADD_ONS.find(a => a.id === id)?.name ?? id;

type Step = { type?: unknown };
type Filter = { id: string; name: string; steps: unknown[] };
const filterList = (v: unknown): Filter[] => (Array.isArray(v) ? v as Filter[] : []).filter(f => f && typeof f.id === 'string');
const hasStep = (steps: unknown, type: string) => Array.isArray(steps) && steps.some(x => (x as Step)?.type === type);

const cents = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isInteger(n) && n >= 50 ? n : fallback; };

// The account's fee waivers ({ id: waived since }), from Tenant.addOnWaivers
export function addOnWaivers(v: unknown): Partial<Record<AddOnId, string>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>)
    .filter(([id, since]) => ADD_ONS.some(a => a.id === id) && typeof since === 'string')) as Partial<Record<AddOnId, string>>;
}

export async function addOnPrices(): Promise<Record<AddOnId, number>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ADD_ONS.map(a => a.setting) } } });
  const m = new Map(rows.map(r => [r.key, r.value]));
  return Object.fromEntries(ADD_ONS.map(a => [a.id, cents(m.get(a.setting), a.defaultCents)])) as Record<AddOnId, number>;
}

export function addOnsInUse(s: Settings): AddOnId[] {
  return ADD_ONS.filter(a => a.inUse(s)).map(a => a.id);
}

// Glamour Style needs Genie 0.6.0+: older iPads reject a whole bundle with an unknown step type, and BoothGen doesn't
// know each iPad's current version. So it's offered to operators (and sent to iPads) only once Super Admin turns
// "Glamour Style available" on (Super Admin → Genie Usage), when 0.6.0 is out.
export const GLAMOUR_STYLE_READY_SETTING = 'glamour_style_ready';

export async function glamourStyleReady(): Promise<boolean> {
  return (await prisma.systemSetting.findUnique({ where: { key: GLAMOUR_STYLE_READY_SETTING } }))?.value === 'on';
}

// The bundle's processing and filters without glamourStyle steps (before Glamour Style is available): a filter left
// with no steps is dropped (Original if none is left), and the default falls back to the first filter left
export function withoutGlamourStyle(processing: unknown, filters: unknown, defaultFilterId: string) {
  const keep = (steps: unknown) => (Array.isArray(steps) ? steps : []).filter(x => (x as Step)?.type !== 'glamourStyle');
  let list = filterList(filters).flatMap(f => {
    const steps = keep(f.steps);
    return Array.isArray(f.steps) && f.steps.length > 0 && steps.length === 0 ? [] : [{ ...f, steps }];
  });
  if (!list.length) list = [{ id: 'original', name: 'Original', steps: [] }];
  return { processing: keep(processing), filters: list, defaultFilterId: list.some(f => f.id === defaultFilterId) ? defaultFilterId : list[0].id };
}
