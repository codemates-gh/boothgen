export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';
import { stripe } from '@/lib/stripe';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch Stripe records and R2 assets before deleting DB
  const [tenant, branding, galleryAssets, templateDesigns] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: params.id },
      include: {
        stripeSubscription: { select: { stripeCustomerId: true, stripeSubscriptionId: true } },
        stripeConnect: { select: { stripeAccountId: true } },
      },
    }),
    prisma.tenantBranding.findUnique({ where: { tenantId: params.id }, select: { logoUrl: true, faviconUrl: true } }),
    prisma.galleryAsset.findMany({ where: { gallery: { tenantId: params.id } }, select: { url: true } }),
    prisma.templateDesign.findMany({ where: { tenantId: params.id }, select: { fileUrl: true } }),
  ]);

  const stripeWarnings: string[] = [];

  // Cancel Stripe subscription and delete customer (platform billing)
  const customerId = tenant?.stripeSubscription?.stripeCustomerId;
  if (customerId && !customerId.startsWith('manual_')) {
    try {
      // Cancelling the subscription first is optional — deleting the customer cascades it,
      // but explicit cancellation avoids a final prorated invoice.
      const subId = tenant?.stripeSubscription?.stripeSubscriptionId;
      if (subId) {
        await stripe.subscriptions.cancel(subId).catch(() => null);
      }
      await stripe.customers.del(customerId);
    } catch (err: any) {
      stripeWarnings.push(`Stripe customer cleanup failed: ${err.message}`);
    }
  }

  // Delete Stripe Connect Express account
  const connectAccountId = tenant?.stripeConnect?.stripeAccountId;
  if (connectAccountId) {
    try {
      await stripe.accounts.del(connectAccountId);
    } catch (err: any) {
      // Deletion fails if account has a pending balance — log and continue
      stripeWarnings.push(`Stripe Connect account not deleted: ${err.message}`);
    }
  }

  // Delete R2 assets
  const r2Keys: string[] = [
    ...(branding?.logoUrl ? [r2KeyFromUrl(branding.logoUrl)] : []),
    ...(branding?.faviconUrl ? [r2KeyFromUrl(branding.faviconUrl)] : []),
    ...galleryAssets.map(a => r2KeyFromUrl(a.url)),
    ...templateDesigns.map(d => r2KeyFromUrl(d.fileUrl)),
  ];
  await Promise.allSettled(r2Keys.map(key => deleteFromR2(key)));

  await prisma.tenant.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, stripeWarnings });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

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
