export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['embed','Lead Capture']];

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
            <div className="flex items-center justify-between flex-wrap gap-3"><div><p className="font-semibold">{sub?.plan ?? 'Free Trial'}</p><p className="text-sm text-gray-500">{sub ? 'Status: ' + sub.status : 'Trial — upgrade to accept payments'}</p></div><Badge variant={sub?.status === 'ACTIVE' ? 'success' : 'warning'}>{sub?.status ?? 'TRIALING'}</Badge></div>
            {!sub && <Button>Upgrade to Pro</Button>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5"/>Stripe Connect</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {conn?.onboardingStatus === 'ACTIVE' ? (
              <div className="flex items-center gap-3 text-green-700 bg-green-50 rounded-xl p-4"><CheckCircle2 className="w-5 h-5"/><div><p className="font-semibold">Connected</p><p className="text-sm">Charges: {conn.chargesEnabled ? 'Enabled' : 'Pending'}</p></div></div>
            ) : conn ? (
              <div className="flex items-center gap-3 text-yellow-700 bg-yellow-50 rounded-xl p-4"><AlertCircle className="w-5 h-5"/><div><p className="font-semibold">Onboarding Incomplete</p><p className="text-sm">Finish your Stripe account setup to accept payments.</p></div></div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">Connect Stripe to accept credit card payments from clients.</p>
            )}
            <a href="/api/stripe/connect/authorize"><Button variant={conn?.onboardingStatus === 'ACTIVE' ? 'outline' : 'default'}>{conn ? 'Update Stripe' : 'Connect Stripe Account'}</Button></a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
