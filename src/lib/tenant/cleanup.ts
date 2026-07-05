import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export async function deleteTenant(tenantId: string): Promise<{ stripeWarnings: string[] }> {
  const stripeWarnings: string[] = [];

  const [tenant, branding, galleryAssets, templateDesigns] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        stripeSubscription: { select: { stripeCustomerId: true, stripeSubscriptionId: true } },
        stripeConnect: { select: { stripeAccountId: true } },
      },
    }),
    prisma.tenantBranding.findUnique({ where: { tenantId }, select: { logoUrl: true, faviconUrl: true } }),
    prisma.galleryAsset.findMany({ where: { gallery: { tenantId } }, select: { url: true } }),
    prisma.templateDesign.findMany({ where: { tenantId }, select: { fileUrl: true } }),
  ]);

  if (!tenant) return { stripeWarnings };

  // Cancel Stripe subscription + delete customer
  const customerId = tenant.stripeSubscription?.stripeCustomerId;
  if (customerId && !customerId.startsWith('manual_')) {
    try {
      const subId = tenant.stripeSubscription?.stripeSubscriptionId;
      if (subId) await stripe.subscriptions.cancel(subId).catch(() => null);
      await stripe.customers.del(customerId);
    } catch (err: any) {
      stripeWarnings.push(`Stripe customer cleanup failed: ${err.message}`);
    }
  }

  // Delete Stripe Connect Express account
  const connectAccountId = tenant.stripeConnect?.stripeAccountId;
  if (connectAccountId) {
    try {
      await stripe.accounts.del(connectAccountId);
    } catch (err: any) {
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

  await prisma.tenant.delete({ where: { id: tenantId } });

  return { stripeWarnings };
}
