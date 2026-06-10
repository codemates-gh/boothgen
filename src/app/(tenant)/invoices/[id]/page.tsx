import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } } } });
  if (!inv) notFound();
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  return (
    <>
      <TopBar title={'Invoice ' + inv.invoiceNumber} />
      <div className="p-8 max-w-4xl space-y-6">
        <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>Invoices</Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{inv.invoiceNumber}</h2><Badge variant={IC[inv.status]}>{inv.status}</Badge></div>
          {inv.status === 'DRAFT' && <form action={'/api/invoices/' + inv.id + '/send'} method="POST"><Button>Send to Client</Button></form>}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Card><CardContent className="pt-6 text-sm"><p className="font-bold text-base mb-1">{tenant?.branding?.companyName ?? tenant?.name}</p>{tenant?.branding?.replyToEmail && <p className="text-gray-600">{tenant.branding.replyToEmail}</p>}</CardContent></Card>
          <Card><CardContent className="pt-6 text-sm"><p className="font-semibold text-xs text-gray-400 uppercase mb-1">Bill To</p><p className="font-bold">{inv.client.firstName} {inv.client.lastName}</p><p className="text-gray-600">{inv.client.email}</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Unit</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
              <tbody>{inv.lineItems.map(li => (<tr key={li.id} className="border-b last:border-0"><td className="px-6 py-3">{li.description}</td><td className="px-6 py-3 text-right">{li.quantity}</td><td className="px-6 py-3 text-right">{fmt(li.unitCents)}</td><td className="px-6 py-3 text-right font-medium">{fmt(li.totalCents)}</td></tr>))}</tbody>
            </table>
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
      </div>
    </>
  );
}
