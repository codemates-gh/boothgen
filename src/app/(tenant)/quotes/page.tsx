'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, FileText, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const QC: Record<string, any> = { DRAFT: 'default', SENT: 'info', VIEWED: 'warning', ACCEPTED: 'success', DECLINED: 'danger', EXPIRED: 'default' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
const EDITABLE = ['DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED'];
const STATUSES = ['ALL', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED'];

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/quotes').then(r => r.json()).then(d => {
      setQuotes(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function deleteQuote(id: string) {
    if (!confirm('Delete this quote? This cannot be undone.')) return;
    setDeleting(id);
    const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
    if (res.ok) setQuotes(q => q.filter(x => x.id !== id));
    else { const d = await res.json().catch(() => ({})); alert(d.error || 'Could not delete quote'); }
    setDeleting(null);
  }

  const visible = filter === 'ALL' ? quotes : quotes.filter(q => q.status === filter);

  return (
    <>
      <TopBar title="Quotes" />
      <div className="p-4 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === s ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                {s !== 'ALL' && <span className="ml-1 opacity-70">({quotes.filter(q => q.status === s).length})</span>}
              </button>
            ))}
          </div>
          <Link href="/quotes/new"><Button><Plus className="w-4 h-4 mr-2" />New Quote</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading...</div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium mb-2">{filter === 'ALL' ? 'No quotes yet' : `No ${filter.toLowerCase()} quotes`}</p>
              {filter === 'ALL' && <Link href="/quotes/new"><Button className="mt-2">Create First Quote</Button></Link>}
            </div>
          ) : (
            <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
              <thead><tr className="border-b bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Quote</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3"></th>
              </tr></thead>
              <tbody>
                {visible.map(q => (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-sm">{q.quoteNumber}</td>
                    <td className="px-6 py-4 text-sm">{q.client?.firstName} {q.client?.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{q.event?.title}</td>
                    <td className="px-6 py-4 text-sm font-medium">{fmt(q.totalCents)}</td>
                    <td className="px-6 py-4"><Badge variant={QC[q.status]}>{q.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(q.createdAt), 'MMM d, yyyy')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {EDITABLE.includes(q.status) && (
                          <button
                            onClick={() => deleteQuote(q.id)}
                            disabled={deleting === q.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Delete quote"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <Link href={'/quotes/' + q.id}>
                          <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4" /></Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
