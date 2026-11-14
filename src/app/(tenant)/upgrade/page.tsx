export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { isGenieOnly, GENIE_HOME } from '@/lib/product';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Names for the CRM areas a Genie-only operator may land on (/upgrade?from=/clients)
const AREAS: [string, string][] = [
  ['/calendar', 'The calendar is'], ['/events', 'Event management is'], ['/clients', 'Clients are'], ['/leads', 'Leads are'],
  ['/messages', 'Messages are'], ['/quotes', 'Quotes are'], ['/invoices', 'Invoices are'], ['/contracts', 'Contracts are'],
  ['/automation', 'Automation is'], ['/analytics', 'Analytics is'], ['/settings/packages', 'Packages are'],
  ['/settings/team', 'Team members are'], ['/settings/coupons', 'Coupons are'], ['/settings/embed', 'Lead capture is'],
  ['/settings/checklists', 'Checklists are'], ['/settings/import', 'Importing clients and events is'],
  ['/settings/print-costs', 'Print costs are'], ['/settings/billing', 'Billing is'],
];

export default async function UpgradePage({ searchParams }: { searchParams: { from?: string } }) {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { product: true } });
  if (!isGenieOnly(tenant)) redirect('/dashboard');
  const from = searchParams.from ?? '';
  const area = AREAS.find(([p]) => from === p || from.startsWith(p + '/'))?.[1];

  return (
    <>
      <TopBar title="Genius"/>
      <div className="p-4 sm:p-8 max-w-2xl">
        <Card><CardContent className="py-10 px-6 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3 text-brand"/>
          <h2 className="text-xl font-bold text-[#1F1F3D] mb-2">{area ? `${area} part of Genius` : 'Get Genius, the BoothGen CRM'}</h2>
          <p className="text-sm text-gray-500 mb-6">
            Genius is BoothGen&apos;s CRM for photo booth businesses: leads, clients, quotes, invoices, contracts, the calendar,
            automation and analytics. Everything you set up in Genie stays as it is.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/pricing"><Button>See Genius plans</Button></Link>
            <Link href={GENIE_HOME}><Button variant="outline">Back to booth events</Button></Link>
          </div>
        </CardContent></Card>
      </div>
    </>
  );
}
