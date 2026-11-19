export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { genieUsage } from '@/lib/genie/usage';
import { GENIUS_PAYS_SETTING, GENIUS_PRICE_SETTING, PRICE_SETTING, eventPrices } from '@/lib/genie/payments';
import { aiSettings, saveAiSettings } from '@/lib/genie/ai/settings';
import { aiUsage } from '@/lib/genie/ai/usage';
import { ADD_ONS, GLAMOUR_STYLE_READY_SETTING, addOnPrices, addOnWaivers, glamourStyleReady } from '@/lib/genie/addOns';

// Super Admin → Genie Usage: per-event usage, both per-event prices, whether Genius accounts pay, and add-on prices
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 90, 1), 730);
  const since = new Date(Date.now() - days * 86400_000);
  const [rows, prices, addOns, ready, waived, ai, aiRows] = await Promise.all([
    genieUsage(since), eventPrices(), addOnPrices(), glamourStyleReady(),
    prisma.tenant.findMany({ where: { NOT: { addOnWaivers: { equals: {} } } }, select: { id: true, name: true, addOnWaivers: true, branding: { select: { companyName: true } } } }),
    aiSettings(), aiUsage(since),
  ]);
  // Operators with add-on fees waived, one row per add-on, oldest first
  const waivers = waived.flatMap(t => Object.entries(addOnWaivers(t.addOnWaivers)).map(([addOnId, since]) => ({
    tenantId: t.id, operator: t.branding?.companyName || t.name, addOnId, addOn: ADD_ONS.find(a => a.id === addOnId)!.name, since,
  }))).sort((a, b) => String(a.since).localeCompare(String(b.since)));
  return NextResponse.json({ days, priceCents: prices.genieCents, geniusPriceCents: prices.geniusCents, geniusPays: prices.geniusPays, addOnPrices: addOns, glamourStyleReady: ready, waivers, ai, aiUsage: aiRows, events: rows });
}

const Cents = z.number().int().min(50).max(100_000);
const Body = z.object({
  priceCents: Cents.optional(), geniusPriceCents: Cents.optional(), geniusPays: z.boolean().optional(),
  // Add-on prices by id (e.g. glamourStyle)
  addOnPrices: z.object(Object.fromEntries(ADD_ONS.map(a => [a.id, Cents.optional()]))).strict().optional(),
  // Glamour Style offered to operators and sent to iPads (turn on once Genie 0.6.0 is on the iPads)
  glamourStyleReady: z.boolean().optional(),
  // Geniefied (Genie P13): allowance, top-ups, trial, models and estimated costs
  ai: z.object({
    ready: z.boolean(), rendersIncluded: z.number().int().min(1).max(100_000), topUpRenders: z.number().int().min(1).max(100_000),
    topUpPriceCents: Cents, trialRenders: z.number().int().min(0).max(1000),
    fastModel: z.string().trim().min(1).max(100), qualityModel: z.string().trim().min(1).max(100),
    fastCostCents: z.number().int().min(0).max(10_000), qualityCostCents: z.number().int().min(0).max(10_000),
  }).partial().strict().optional(),
}).strict();

const put = (key: string, value: string) => prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Price must be between $0.50 and $1,000' }, { status: 400 });
  const { priceCents, geniusPriceCents, geniusPays, addOnPrices: addOns, glamourStyleReady: ready, ai } = parsed.data;
  if (ai) await saveAiSettings(ai);
  await Promise.all([
    priceCents !== undefined && put(PRICE_SETTING, String(priceCents)),
    geniusPriceCents !== undefined && put(GENIUS_PRICE_SETTING, String(geniusPriceCents)),
    geniusPays !== undefined && put(GENIUS_PAYS_SETTING, geniusPays ? 'on' : 'off'),
    ...ADD_ONS.map(a => addOns?.[a.id] !== undefined && put(a.setting, String(addOns[a.id]))),
    ready !== undefined && put(GLAMOUR_STYLE_READY_SETTING, ready ? 'on' : 'off'),
  ]);
  const [p, a, r, ais] = await Promise.all([eventPrices(), addOnPrices(), glamourStyleReady(), aiSettings()]);
  return NextResponse.json({ priceCents: p.genieCents, geniusPriceCents: p.geniusCents, geniusPays: p.geniusPays, addOnPrices: a, glamourStyleReady: r, ai: ais });
}
