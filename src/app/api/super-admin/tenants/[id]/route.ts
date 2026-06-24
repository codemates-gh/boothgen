export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Collect all R2 keys to delete before removing DB records
  const [branding, galleryAssets, templateDesigns] = await Promise.all([
    prisma.tenantBranding.findUnique({ where: { tenantId: params.id }, select: { logoUrl: true, faviconUrl: true } }),
    prisma.galleryAsset.findMany({ where: { gallery: { tenantId: params.id } }, select: { url: true } }),
    prisma.templateDesign.findMany({ where: { tenantId: params.id }, select: { fileUrl: true } }),
  ]);

  const r2Keys: string[] = [
    ...(branding?.logoUrl ? [r2KeyFromUrl(branding.logoUrl)] : []),
    ...(branding?.faviconUrl ? [r2KeyFromUrl(branding.faviconUrl)] : []),
    ...galleryAssets.map(a => r2KeyFromUrl(a.url)),
    ...templateDesigns.map(d => r2KeyFromUrl(d.fileUrl)),
  ];

  await Promise.allSettled(r2Keys.map(key => deleteFromR2(key)));

  await prisma.tenant.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
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
