import type { EventGenieSettings } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

// Paid per-event Genie add-ons (2.114.0). An add-on is "in use" when the event's settings use it (e.g. a Glamour Style
// filter); it's then charged with the event, in the same checkout (or its own checkout when the event is already paid
// or the account doesn't pay per event). Until it's paid the event runs watermarked, as an unpaid Genie event does
// (G, 2026-11-19), so an add-on reaches the iPad only on an event that pays for it or shows the watermark.
// Prices: Super Admin → Genie Usage ($15 for Glamour Style until changed there).

export type AddOnId = 'glamourStyle';

type Settings = Pick<EventGenieSettings, 'processing' | 'filters'>;

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
];

export const addOnName = (id: string) => ADD_ONS.find(a => a.id === id)?.name ?? id;

type Step = { type?: unknown };
type Filter = { id: string; name: string; steps: unknown[] };
const filterList = (v: unknown): Filter[] => (Array.isArray(v) ? v as Filter[] : []).filter(f => f && typeof f.id === 'string');
const hasStep = (steps: unknown, type: string) => Array.isArray(steps) && steps.some(x => (x as Step)?.type === type);

const cents = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isInteger(n) && n >= 50 ? n : fallback; };

export async function addOnPrices(): Promise<Record<AddOnId, number>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: ADD_ONS.map(a => a.setting) } } });
  const m = new Map(rows.map(r => [r.key, r.value]));
  return Object.fromEntries(ADD_ONS.map(a => [a.id, cents(m.get(a.setting), a.defaultCents)])) as Record<AddOnId, number>;
}

export function addOnsInUse(s: Settings): AddOnId[] {
  return ADD_ONS.filter(a => a.inUse(s)).map(a => a.id);
}
