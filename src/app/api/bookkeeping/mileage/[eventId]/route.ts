export const dynamic = 'force-dynamic';
// One event's mileage: how it's worked out (GET), and the operator's changes (PATCH): start and return addresses,
// round trip or one way, their own miles, or a fresh lookup. Bookkeeping's line updates right away.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { ensureMileage, mileageCalc, venueAddress } from '@/lib/bookkeeping/mileage';
import { getIrsRates } from '@/lib/bookkeeping/mileageRates';
import { syncLedger } from '@/lib/bookkeeping/sync';
import { z } from 'zod';

async function view(tenantId: string, eventId: string) {
  const [event, branding, irs] = await Promise.all([
    prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { id: true, title: true, eventDate: true, venueName: true, venueAddress: true, venueCity: true, venueState: true, venuePostalCode: true, mileage: true } }),
    prisma.tenantBranding.findUnique({ where: { tenantId }, select: { businessAddress: true, mileageRateCents: true } }),
    getIrsRates(),
  ]);
  if (!event) return null;
  const m = event.mileage;
  return {
    eventId: event.id, title: event.title, venue: venueAddress(event), homeBase: branding?.businessAddress ?? null,
    startAddress: m?.startAddress ?? null, returnAddress: m?.returnAddress ?? null, roundTrip: m?.roundTrip ?? true,
    overrideMiles: m?.overrideMiles ?? null, oneWayMiles: m?.oneWayMiles ?? null, returnMiles: m?.returnMiles ?? null,
    status: m?.status ?? 'pending', error: m?.error ?? null, computedAt: m?.computedAt ?? null,
    calc: m ? mileageCalc(m, event.eventDate, branding?.mileageRateCents, irs) : null,
  };
}

export async function GET(_: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const v = await view(who.tenantId, eventId);
  return v ? NextResponse.json(v) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

const Patch = z.object({
  startAddress: z.string().trim().max(300).nullable().optional(),
  returnAddress: z.string().trim().max(300).nullable().optional(),
  roundTrip: z.boolean().optional(),
  overrideMiles: z.number().min(0).max(10000).nullable().optional(),
  recalculate: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: who.tenantId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const d = parsed.data;
  const data = {
    ...(d.startAddress !== undefined ? { startAddress: d.startAddress || null } : {}),
    ...(d.returnAddress !== undefined ? { returnAddress: d.returnAddress || null } : {}),
    ...(d.roundTrip !== undefined ? { roundTrip: d.roundTrip } : {}),
    ...(d.overrideMiles !== undefined ? { overrideMiles: d.overrideMiles } : {}),
  };
  await prisma.eventMileage.upsert({ where: { eventId }, update: data, create: { tenantId: who.tenantId, eventId, ...data } });
  await ensureMileage(who.tenantId, { eventId, force: !!d.recalculate });
  await syncLedger(who.tenantId);
  return NextResponse.json(await view(who.tenantId, eventId));
}
