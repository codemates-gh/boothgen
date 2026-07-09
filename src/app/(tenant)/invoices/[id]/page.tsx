export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Bell, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import MilestonesCard from './MilestonesCard';
import { fmtCents } from '@/lib/utils';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };

export default async function InvoiceDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { reminded?: string } }) {
  const session = await requireTenantSession();
  const isAdmin = session.tenantRole === 'HOST_ADMIN';
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } }),
    prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } }),
  ]);
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL';
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } } });
  if (!inv) notFound();
  const fmt = (c: number) => fmtCents(c, inv.currency ?? 'usd');
  return (
    <>
      <TopBar title={'Invoice ' + inv.invoiceNumber} />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Invoices</Link>
        {searchParams?.reminded === '1' && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            Reminder sent to {inv.client.firstName} {inv.client.lastName} ({inv.client.email}).
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><h2 className="text-xl sm:text-2xl font-bold">{inv.invoiceNumber}</h2><Badge variant={IC[inv.status]}>{inv.status}</Badge></div>
          <div className="flex gap-2 flex-wrap">
            <a href={'/api/invoices/' + inv.id + '/pdf'} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1.5"/>Download PDF</Button></a>
            {inv.status === 'DRAFT' && <form action={'/api/invoices/' + inv.id + '/send'} method="POST"><Button>Send to Client</Button></form>}
            {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) && inv.balanceDueCents > 0 && (
              <form action={'/api/invoices/' + inv.id + '/remind'} method="POST">
                <Button variant="outline" size="sm"><Bell className="w-4 h-4 mr-1.5"/>Send Reminder</Button>
              </form>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card><CardContent className="pt-6 text-sm"><p className="font-bold text-base mb-1">{tenant?.branding?.companyName ?? tenant?.name}</p>{tenant?.branding?.replyToEmail && <p className="text-gray-600">{tenant.branding.replyToEmail}</p>}</CardContent></Card>
          <Card><CardContent className="pt-6 text-sm"><p className="font-semibold text-xs text-gray-400 uppercase mb-1">Bill To</p><p className="font-bold">{inv.client.firstName} {inv.client.lastName}</p><p className="text-gray-600">{inv.client.email}</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Unit</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
                <tbody>{inv.lineItems.map(li => (<tr key={li.id} className="border-b last:border-0"><td className="px-6 py-3">{li.description}</td><td className="px-6 py-3 text-right">{li.quantity}</td><td className="px-6 py-3 text-right">{fmt(li.unitCents)}</td><td className="px-6 py-3 text-right font-medium">{fmt(li.totalCents)}</td></tr>))}</tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t text-right space-y-1 text-sm">
              <p className="text-gray-500">Subtotal: {fmt(inv.subtotalCents)}</p>
              {inv.taxAmountCents > 0 && <p className="text-gray-500">Tax: {fmt(inv.taxAmountCents)}</p>}
              <p className="text-xl font-bold">Total: {fmt(inv.totalCents)}</p>
              <p className="text-gray-500">Paid: {fmt(inv.amountPaidCents)}</p>
              <p className={'font-bold ' + (inv.balanceDueCents > 0 ? 'text-brand' : 'text-green-600')}>Balance Due: {fmt(inv.balanceDueCents)}</p>
              {inv.dueDate && <p className="text-gray-400 text-xs">Due {format(inv.dueDate,'MMMM d, yyyy')}</p>}
            </div>
          </CardContent>
        </Card>
        {(inv as any).PaymentMilestone?.length > 0 && (
          <MilestonesCard
            invoiceId={inv.id}
            milestones={(inv as any).PaymentMilestone}
            isAdmin={isAdmin}
            isPro={isPro}
            currency={inv.currency ?? 'usd'}
          />
        )}
      </div>
    </>
  );
}
