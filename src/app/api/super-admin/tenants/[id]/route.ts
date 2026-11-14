export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteTenant } from '@/lib/tenant/cleanup';
import { isProduct } from '@/lib/product';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { stripeWarnings } = await deleteTenant(params.id);
  return NextResponse.json({ success: true, stripeWarnings });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

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

  // Genie add-on on/off (until billing exists). A Genie-only account can't turn it off.
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
