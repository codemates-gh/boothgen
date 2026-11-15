export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { RULE_SETTING, accountsLosingGenius, enforceGenius, ruleOn } from '@/lib/genius';

// Super Admin → Operators: "Genius needs Pro". GET shows whether it's on and which Genius accounts would become Genie
// only; turning it on switches them right away (G: no notice period), and the daily job keeps it applied.
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const [on, losing] = await Promise.all([ruleOn(), accountsLosingGenius()]);
  return NextResponse.json({ on, losing: losing.map(t => ({ id: t.id, name: t.name, status: t.status, plan: t.stripeSubscription?.plan ?? null })) });
}

const Body = z.object({ on: z.boolean() }).strict();

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const value = parsed.data.on ? 'on' : 'off';
  await prisma.systemSetting.upsert({ where: { key: RULE_SETTING }, update: { value }, create: { key: RULE_SETTING, value } });
  const switched = parsed.data.on ? await enforceGenius() : 0;
  return NextResponse.json({ on: parsed.data.on, switched });
}
