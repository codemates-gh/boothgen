'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const IC: Record<string,any> = { DRAFT:'default', SENT:'info', PARTIALLY_PAID:'warning', PAID:'success', OVERDUE:'danger', CANCELLED:'danger' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
const STATUSES = ['ALL', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/invoices').then(r => r.json()).then(d => {
      setInvoices(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const visible = filter === 'ALL' ? invoices : invoices.filter(inv => inv.status === filter);

  return (
    <>
      <TopBar title="Invoices" />
      <div className="p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'ALL' ? 'All' : s.replace('_', ' ').charAt(0) + s.replace('_', ' ').slice(1).toLowerCase()}
                {s !== 'ALL' && <span className="ml-1 opacity-70">({invoices.filter(inv => inv.status === s).length})</span>}
              </button>
            ))}
          </div>
          <Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-2"/>New Invoice</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-16 text-gray-400">Loading...</div>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Balance</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Due</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">
                      {filter === 'ALL' ? <>No invoices yet. <Link href="/invoices/new" className="text-brand hover:underline">Create one</Link></> : `No ${filter.replace('_', ' ').toLowerCase()} invoices`}
                    </td></tr>
                  )}
                  {visible.map((inv: any) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-semibold text-sm">{inv.invoiceNumber}</p>{inv.event && <p className="text-xs text-gray-400">{inv.event.title}</p>}</td>
                      <td className="px-6 py-4 text-sm">{inv.client?.firstName} {inv.client?.lastName}</td>
                      <td className="px-6 py-4 text-sm font-medium">{fmt(inv.totalCents)}</td>
                      <td className="px-6 py-4 text-sm">{fmt(inv.balanceDueCents)}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{(() => {
                          const nextMs = inv.PaymentMilestone?.find((m: any) => m.status !== 'PAID');
                          const d = nextMs?.dueDate ?? inv.dueDate;
                          return d ? format(new Date(d), 'MMM d') : '—';
                        })()}</td>
                      <td className="px-6 py-4"><Badge variant={IC[inv.status]}>{inv.status}</Badge></td>
                      <td className="px-6 py-4 text-right"><Link href={'/invoices/' + inv.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent></Card>
      </div>
    </>
  );
}
