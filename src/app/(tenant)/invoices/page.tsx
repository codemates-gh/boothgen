import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export default async function InvoicesPage() {
  const session = await requireTenantSession();
  const invoices = await prisma.invoice.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Invoices" />
      <div className="p-8">
        <div className="flex justify-end mb-6"><Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-2"/>New Invoice</Button></Link></div>
        <Card><CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400">No invoices yet. <Link href="/invoices/new" className="text-brand hover:underline">Create one</Link></td></tr>}
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-4"><p className="font-semibold text-sm">{inv.invoiceNumber}</p>{inv.event && <p className="text-xs text-gray-400">{inv.event.title}</p>}</td>
                  <td className="px-6 py-4 text-sm">{inv.client.firstName} {inv.client.lastName}</td>
                  <td className="px-6 py-4 text-sm font-medium">{fmt(inv.totalCents)}</td>
                  <td className="px-6 py-4 text-sm">{fmt(inv.balanceDueCents)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{inv.dueDate ? format(inv.dueDate,'MMM d') : '—'}</td>
                  <td className="px-6 py-4"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td>
                  <td className="px-6 py-4 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </>
  );
}
