export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { eventsUsingSpin, spinSetup, styleView } from '@/lib/genie/spin360';
import { Segments } from '@/lib/genie/spin360Options';

type Ctx = { params: Promise<{ styleId: string }> };
const Body = z.object({
  name: z.string().trim().min(1, 'Give the style a name').max(40, 'Keep the name to 40 characters'),
  description: z.string().trim().max(80, 'Keep the description to 80 characters'),
  captureFps: z.union([z.literal(120), z.literal(240)]),
  segments: Segments,
}).partial().strict();

async function mine(styleId: string) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return { error: auth };
  const s = await prisma.genieSpinStyle.findFirst({ where: { id: styleId, tenantId: auth.tenantId } });
  return s ? { s, tenantId: auth.tenantId } : { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
}

// Changes one of My styles; a new speed ramp or capture bumps its version (events pick it up on their next update)
export async function PATCH(req: NextRequest, props: Ctx) {
  const m = await mine((await props.params).styleId);
  if ('error' in m) return m.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const ramp = (parsed.data.segments && JSON.stringify(parsed.data.segments) !== JSON.stringify(m.s.segments)) || (parsed.data.captureFps && parsed.data.captureFps !== m.s.captureFps);
  const saved = await prisma.genieSpinStyle.update({ where: { id: m.s.id }, data: { ...parsed.data, ...(ramp ? { version: m.s.version + 1 } : {}) } });
  return NextResponse.json({ style: styleView(saved) });
}

// Deletes one of My styles that no event and not the Genie 360 setup uses
export async function DELETE(_req: NextRequest, props: Ctx) {
  const m = await mine((await props.params).styleId);
  if ('error' in m) return m.error;
  const n = await eventsUsingSpin('style', m.s.id);
  if (n > 0) return NextResponse.json({ error: `${n === 1 ? 'An event uses' : `${n} events use`} this style. Pick another style on ${n === 1 ? 'it' : 'them'} first.`, code: 'in_use' }, { status: 409 });
  if ((await spinSetup(m.tenantId)).styleId === m.s.id) return NextResponse.json({ error: 'Your Genie 360 setup uses this style. Pick another one there first.', code: 'in_use' }, { status: 409 });
  await prisma.genieSpinStyle.delete({ where: { id: m.s.id } });
  return NextResponse.json({ ok: true });
}
