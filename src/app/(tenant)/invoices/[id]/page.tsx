export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Bell, CheckCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import MilestonesCard from './MilestonesCard';
import InvoiceActionsMenu from './InvoiceActionsMenu';
import { manualPaymentMethod, settleZeroInvoice } from '@/lib/invoices/payments';
import { fmtCents } from '@/lib/utils';
import { clientDisplayName } from '@/lib/clientName';
import { splitLineItemDescription } from '@/lib/lineItems';


const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };

function DescriptionCell({ text }: { text: string }) {
  const { title, bullets } = splitLineItemDescription(text);
  if (bullets.length === 0) return <span>{text}</span>;
  return (
    <div>
      <span className="font-medium">{title}</span>
      <ul className="mt-1 space-y-0.5 text-gray-600 text-xs">
        {bullets.map((p, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-gray-400 flex-shrink-0 mt-px">·</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function InvoiceDetailPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ reminded?: string; from?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const session = await requireTenantSession();
  const isAdmin = session.tenantRole === 'HOST_ADMIN';
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } }),
    prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } }),
  ]);
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL' || subscription?.plan === 'LIFETIME';
  const load = () => prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: { orderBy: { paidAt: 'desc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } } });
  let inv = await load();
  if (!inv) notFound();
  // A sent $0 invoice counts as paid
  if (await settleZeroInvoice(prisma, inv.id)) inv = (await load())!;
  // Full-payment invoices (no schedule) get a single "Payment in full" row to mark paid; Stripe payments can't be undone here
  const fullPaymentMethod = inv.PaymentMilestone.length === 0 && inv.status === 'PAID' ? await manualPaymentMethod(inv.id) : null;
  const fmt = (c: number) => fmtCents(c, inv.currency ?? 'usd');
  // Opened from an event: Back, Send and Delete keep the operator on that event
  const backToEvent = searchParams?.from === 'event' && !!inv.eventId;
  const fromQs = backToEvent ? '?from=event' : '';
  return (
    <>
      <TopBar title={'Invoice ' + inv.invoiceNumber} />
      <div className="p-4 sm:p-8 max-w-4xl space-y-6">
        <Link href={backToEvent ? '/events/' + inv.eventId : '/invoices'} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4"/>{backToEvent ? 'Back to Event' : 'Back to Invoices'}</Link>
        {searchParams?.reminded === '1' && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            Reminder sent to {inv.client.firstName} {inv.client.lastName} ({inv.client.email}).
          </div>
        )}
        {/* Header: number, status and client on the left; main actions and the ••• menu on the right (same as events) */}
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold">{inv.invoiceNumber}</h2>
              <Badge variant={IC[inv.status]}>{inv.status.replace(/_/g, ' ')}</Badge>
            </div>
            <p className="text-gray-500 text-sm">{[clientDisplayName(inv.client), inv.event?.title].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:flex-shrink-0">
            {inv.status === 'DRAFT' && <form action={'/api/invoices/' + inv.id + '/send' + fromQs} method="POST"><Button size="sm"><Send className="w-3.5 h-3.5 mr-1.5"/>Send to Client</Button></form>}
            {['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status) && inv.balanceDueCents > 0 && (
              <form action={'/api/invoices/' + inv.id + '/remind' + fromQs} method="POST">
                <Button variant="outline" size="sm"><Bell className="w-3.5 h-3.5 mr-1.5"/>Send Reminder</Button>
              </form>
            )}
            <InvoiceActionsMenu invoiceId={inv.id} invoiceNumber={inv.invoiceNumber} eventId={inv.eventId ?? null} canDelete={isAdmin} afterDelete={backToEvent ? '/events/' + inv.eventId : '/invoices'} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Card><CardContent className="pt-6 text-sm"><p className="font-bold text-base mb-1">{tenant?.branding?.companyName ?? tenant?.name}</p>{tenant?.branding?.replyToEmail && <p className="text-gray-600">{tenant.branding.replyToEmail}</p>}</CardContent></Card>
          <Card><CardContent className="pt-6 text-sm"><p className="font-semibold text-xs text-gray-400 uppercase mb-1">Bill To</p><p className="font-bold">{clientDisplayName(inv.client)}</p><p className="text-gray-600">{inv.client.email}</p></CardContent></Card>
        </div>
        <Card>
          <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
          <CardContent className="p-0">
            {/* Phones: one stacked block per line item, so the description gets the full width */}
            <div className="sm:hidden divide-y">
              {inv.lineItems.map(li => (
                <div key={li.id} className="px-5 py-4 text-sm">
                  <div className="text-gray-800 mb-2"><DescriptionCell text={li.description} /></div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Qty: <strong className="text-gray-700">{li.quantity}</strong></span>
                    <span>Unit: <strong className="text-gray-700">{fmt(li.unitCents)}</strong></span>
                    <span className="ml-auto font-semibold text-sm text-gray-900">{fmt(li.totalCents)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 font-medium text-gray-500">Description</th><th className="text-right px-6 py-3 font-medium text-gray-500">Qty</th><th className="text-right px-6 py-3 font-medium text-gray-500">Unit</th><th className="text-right px-6 py-3 font-medium text-gray-500">Total</th></tr></thead>
                <tbody>{inv.lineItems.map(li => (<tr key={li.id} className="border-b last:border-0"><td className="px-6 py-4"><DescriptionCell text={li.description} /></td><td className="px-6 py-4 text-right align-top">{li.quantity}</td><td className="px-6 py-4 text-right align-top">{fmt(li.unitCents)}</td><td className="px-6 py-4 text-right align-top font-medium">{fmt(li.totalCents)}</td></tr>))}</tbody>
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
        {inv.PaymentMilestone.length === 0 && inv.status !== 'CANCELLED' && (
          <MilestonesCard
            key={inv.status}
            mode="full"
            invoiceId={inv.id}
            milestones={[{
              id: 'full', label: 'Payment in full', amountCents: inv.totalCents, dueDate: inv.dueDate ?? inv.createdAt,
              status: inv.status === 'PAID' ? 'PAID' : inv.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING',
              paymentMethod: inv.status === 'PAID' ? (fullPaymentMethod === undefined ? 'stripe' : fullPaymentMethod) : null,
            }]}
            isAdmin={isAdmin}
            isPro={isPro}
            currency={inv.currency ?? 'usd'}
          />
        )}
      </div>
    </>
  );
}
