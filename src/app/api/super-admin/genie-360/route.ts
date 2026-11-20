export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { addOnPrices } from '@/lib/genie/addOns';
import { GENIE360_READY_SETTING, genie360Ready, overlayView, spinStyles, styleView, trackView } from '@/lib/genie/spin360';

// Super Admin → Genie 360: available switch, add-on price, styles, Standard music, music links, Standard overlays
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const [ready, prices, styles, music, links, overlays] = await Promise.all([
    genie360Ready(), addOnPrices(), spinStyles(true),
    prisma.genieMusicTrack.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.genieMusicLink.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.genieSpinOverlay.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  return NextResponse.json({
    ready, priceCents: prices.genie360,
    styles: styles.map(styleView),
    music: music.map(t => ({ ...trackView(t), licenseNotes: t.licenseNotes })),
    links: links.map(l => ({ id: l.id, name: l.name, url: l.url, note: l.note, isActive: l.isActive })),
    overlays: overlays.map(overlayView),
  });
}

const Body = z.object({ ready: z.boolean() }).strict();

// "Genie 360 available": operators can add it to events (turn on once the TestFlight build is ready)
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const value = parsed.data.ready ? 'on' : 'off';
  await prisma.systemSetting.upsert({ where: { key: GENIE360_READY_SETTING }, update: { value }, create: { key: GENIE360_READY_SETTING, value } });
  return NextResponse.json({ ready: await genie360Ready() });
}
