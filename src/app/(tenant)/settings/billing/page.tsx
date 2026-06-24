export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Link2, ExternalLink } from 'lucide-react';
import { PaymentTermsCard } from './PaymentTermsCard';
import { UpgradeButton } from './UpgradeButton';
import { StripeConnectCard } from './StripeConnectCard';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile']];

export default async function BillingSettingsPage() {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeSubscription: true, stripeConnect: true } });
  const sub = tenant?.stripeSubscription;
  const conn = tenant?.stripeConnect;
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-3 sm:px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'billing' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5"/>Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3"><div><p className="font-semibold">{sub?.plan === 'MONTHLY' ? 'Pro Monthly' : sub?.plan === 'ANNUAL' ? 'Pro Annual' : 'Free Trial'}</p><p className="text-sm text-gray-500">{sub ? 'Status: ' + sub.status : 'Trial — upgrade to unlock all features'}</p>{sub?.currentPeriodEnd && <p className="text-xs text-gray-400 mt-0.5">Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}</div><Badge variant={sub?.status === 'ACTIVE' ? 'success' : 'warning'}>{sub?.status ?? 'TRIALING'}</Badge></div>
            {!sub && <UpgradeButton />}
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
      </div>
    </>
  );
}
