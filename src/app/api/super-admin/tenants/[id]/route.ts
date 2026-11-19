export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { ADD_ONS, addOnWaivers, type AddOnId } from '@/lib/genie/addOns';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteTenant } from '@/lib/tenant/cleanup';
import { isProduct } from '@/lib/product';

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { stripeWarnings } = await deleteTenant(params.id);
  return NextResponse.json({ success: true, stripeWarnings });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // Product: Genius (CRM) or Genie only. Genie only turns Genie on; switching back keeps Genie as it was.
  if (body.product !== undefined) {
    if (!isProduct(body.product)) return NextResponse.json({ error: 'Product must be crm or genie' }, { status: 400 });
    const current = await prisma.tenant.findUnique({ where: { id: params.id }, select: { genieEnabled: true } });
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const tenant = await prisma.tenant.update({
      where: { id: params.id },
      data: { product: body.product, ...(body.product === 'genie' && !current.genieEnabled ? { genieEnabled: true, genieEnabledAt: new Date() } : {}) },
      select: { id: true, product: true, genieEnabled: true },
    });
    return NextResponse.json(tenant);
  }

  // Fee waiver for a paid Genie add-on (e.g. Glamour Style for partner operators): { addOnWaiver: { id, waived } }
  if (body.addOnWaiver && typeof body.addOnWaiver === 'object') {
    const { id, waived } = body.addOnWaiver as { id?: unknown; waived?: unknown };
    if (!ADD_ONS.some(a => a.id === id) || typeof waived !== 'boolean') return NextResponse.json({ error: 'Unknown add-on' }, { status: 400 });
    try {
      const t = await prisma.tenant.findUnique({ where: { id: params.id }, select: { addOnWaivers: true } });
      if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const current = addOnWaivers(t.addOnWaivers);
      const next: Record<string, string> = { ...current };
      if (waived) next[id as string] = current[id as AddOnId] ?? new Date().toISOString();
      else delete next[id as string];
      const tenant = await prisma.tenant.update({ where: { id: params.id }, data: { addOnWaivers: next }, select: { id: true, addOnWaivers: true } });
      console.log(`[super-admin] add-on waiver ${id} ${waived ? 'on' : 'off'} for tenant ${params.id}`);
      return NextResponse.json(tenant);
    } catch (e) {
      console.error(`[super-admin] add-on waiver ${id} failed for tenant ${params.id}:`, e);
      return NextResponse.json({ error: `Saving the waiver failed: ${e instanceof Error ? e.message.split('\n').filter(Boolean).pop() : 'database error'}` }, { status: 500 });
    }
  }

  // Genie add-on on/off (until billing exists). A Genie-only account can't turn it off.
  // Keep Genius free: keeps the CRM without Genius Pro (src/lib/genius.ts)
  if (typeof body.geniusFree === 'boolean') {
    const tenant = await prisma.tenant.update({ where: { id: params.id }, data: { geniusFree: body.geniusFree }, select: { id: true, geniusFree: true } });
    return NextResponse.json(tenant);
  }

  if (typeof body.genieEnabled === 'boolean') {
    if (!body.genieEnabled) {
      const t = await prisma.tenant.findUnique({ where: { id: params.id }, select: { product: true } });
      if (t?.product === 'genie') return NextResponse.json({ error: 'Genie-only accounts always have Genie. Switch the account to Genius first.' }, { status: 409 });
    }
    const tenant = await prisma.tenant.update({
      where: { id: params.id },
      data: { genieEnabled: body.genieEnabled, ...(body.genieEnabled ? { genieEnabledAt: new Date() } : {}) },
      select: { id: true, genieEnabled: true, genieEnabledAt: true },
    });
    return NextResponse.json(tenant);
  }

  // Tenant status change (TRIAL / ACTIVE / SUSPENDED / CANCELLED)
  if (body.status) {
    const tenant = await prisma.tenant.update({ where: { id: params.id }, data: { status: body.status } });
    return NextResponse.json(tenant);
  }

  // Manual plan upgrade/downgrade
  if (body.plan) {
    const plan: 'FREE_TRIAL' | 'MONTHLY' | 'ANNUAL' = body.plan;

    if (plan === 'FREE_TRIAL') {
      // Downgrade: mark subscription as cancelled if one exists
      await prisma.stripeSubscription.updateMany({
        where: { tenantId: params.id },
        data: { plan: 'FREE_TRIAL', status: 'TRIALING' },
      });
    } else {
      // Upgrade: upsert subscription record
      const existing = await prisma.stripeSubscription.findUnique({ where: { tenantId: params.id } });
      if (existing) {
        await prisma.stripeSubscription.update({
          where: { tenantId: params.id },
          data: { plan, status: 'ACTIVE', cancelAtPeriodEnd: false, cancelledAt: null },
        });
      } else {
        await prisma.stripeSubscription.create({
          data: {
            tenantId: params.id,
            stripeCustomerId: `manual_${params.id}`,
            plan,
            status: 'ACTIVE',
          },
        });
      }
      // Also mark the tenant as ACTIVE
      await prisma.tenant.update({ where: { id: params.id }, data: { status: 'ACTIVE' } });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}
