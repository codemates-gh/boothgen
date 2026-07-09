export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Link2, ExternalLink, Download } from 'lucide-react';
import { PaymentTermsCard } from './PaymentTermsCard';
import { UpgradeButton } from './UpgradeButton';
import { StripeConnectCard } from './StripeConnectCard';
import { CancelAccountButton } from './CancelAccountButton';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];

export default async function BillingSettingsPage({ searchParams }: { searchParams?: { upgraded?: string } }) {
  const session = await requireTenantSession();
  let tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeSubscription: true, stripeConnect: true } });

  // When returning from Stripe checkout, sync directly from Stripe in case the webhook
  // hasn't fired yet (wrong secret, timing, etc.)
  if (searchParams?.upgraded === '1') {
    const customerId = tenant?.stripeSubscription?.stripeCustomerId;
    if (customerId && !customerId.startsWith('manual_')) {
      try {
        const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 });
        const activeSub = subs.data[0];
        if (activeSub) {
          const priceId = activeSub.items.data[0]?.price?.id;
          const annualSetting = await prisma.systemSetting.findUnique({ where: { key: 'stripe_price_annual_id' } });
          const plan = priceId === annualSetting?.value ? 'ANNUAL' : 'MONTHLY';
          await prisma.stripeSubscription.update({
            where: { tenantId: session.tenantId },
            data: {
              stripeSubscriptionId: activeSub.id,
              plan,
              status: 'ACTIVE',
              stripePriceId: priceId,
              currentPeriodStart: new Date(activeSub.current_period_start * 1000),
              currentPeriodEnd: new Date(activeSub.current_period_end * 1000),
              cancelAtPeriodEnd: activeSub.cancel_at_period_end,
            },
          });
          await prisma.tenant.update({ where: { id: session.tenantId }, data: { status: 'ACTIVE' } });
          tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeSubscription: true, stripeConnect: true } });
        }
      } catch (e) {
        console.error('[billing] post-checkout Stripe sync failed:', e);
      }
    }
  }

  const sub = tenant?.stripeSubscription;
  const conn = tenant?.stripeConnect;
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'billing' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5"/>Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3"><div><p className="font-semibold">{sub?.plan === 'MONTHLY' ? 'Pro Monthly' : sub?.plan === 'ANNUAL' ? 'Pro Annual' : 'Commission Plan'}</p><p className="text-sm text-gray-500">{sub?.status === 'ACTIVE' ? 'Status: ACTIVE' : (!sub || sub.status === 'TRIALING') ? 'Pay only when you collect — no monthly fee' : 'Status: ' + sub.status}</p>{sub?.currentPeriodEnd && <p className="text-xs text-gray-400 mt-0.5">Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}</div><Badge variant={sub?.status === 'ACTIVE' ? 'success' : (!sub || sub.status === 'TRIALING') ? 'success' : 'warning'}>{sub?.status === 'TRIALING' || !sub ? 'ACTIVE' : sub.status}</Badge></div>
            {(!sub || sub.status === 'TRIALING') && <UpgradeButton />}
            {sub && sub.status === 'ACTIVE' && (
              <a href="/api/stripe/billing/portal"><Button variant="outline" className="flex items-center gap-2"><ExternalLink className="w-4 h-4"/>Manage Subscription</Button></a>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5"/>Stripe Connect</CardTitle></CardHeader>
          <CardContent>
            <StripeConnectCard
              status={conn?.onboardingStatus === 'ACTIVE' ? 'active' : conn ? 'incomplete' : 'none'}
              chargesEnabled={conn?.chargesEnabled ?? false}
            />
          </CardContent>
        </Card>
        <PaymentTermsCard />

        {/* Data Export */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Download className="w-5 h-5"/>Export Your Data</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">Download your data as CSV files you can open in Excel or Google Sheets.</p>
            <div className="flex flex-wrap gap-3">
              <a href="/api/settings/export?type=clients"><Button variant="outline" size="sm">Clients</Button></a>
              <a href="/api/settings/export?type=events"><Button variant="outline" size="sm">Events</Button></a>
              <a href="/api/settings/export?type=invoices"><Button variant="outline" size="sm">Invoices</Button></a>
            </div>
          </CardContent>
        </Card>

        {/* Cancel Account */}
        {tenant?.status !== 'CANCELLED' && (
          <Card className="border-red-200">
            <CardHeader><CardTitle className="text-red-700 text-base">Cancel Account</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-500">Your data will remain accessible for 30 days after cancellation so you can export it. After that, everything is permanently deleted.</p>
              <CancelAccountButton />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
