import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, FileText } from 'lucide-react';
import { format } from 'date-fns';

const QC: Record<string,any> = { DRAFT:'default', SENT:'info', VIEWED:'warning', ACCEPTED:'success', DECLINED:'danger', EXPIRED:'default' };
const fmt = (c: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'usd' }).format(c/100);

export default async function QuotesPage() {
  const session = await requireTenantSession();
  const quotes = await prisma.quote.findMany({
    where: { tenantId: session.tenantId },
    include: { client: true, event: true },
    orderBy: { createdAt: 'desc' }, take: 200,
  });
  return (
    <>
      <TopBar title="Quotes" />
      <div className="p-8">
        <div className="flex justify-end mb-6">
          <Link href="/quotes/new"><Button><Plus className="w-4 h-4 mr-2"/>New Quote</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          {quotes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
              <p className="font-medium mb-2">No quotes yet</p>
              <Link href="/quotes/new"><Button className="mt-2">Create First Quote</Button></Link>
            </div>
          ) : (
            <table className="w-full">
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
                {quotes.map(q => (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-sm">{q.quoteNumber}</td>
                    <td className="px-6 py-4 text-sm">{q.client.firstName} {q.client.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{q.event.title}</td>
                    <td className="px-6 py-4 text-sm font-medium">{fmt(q.totalCents)}</td>
                    <td className="px-6 py-4"><Badge variant={QC[q.status]}>{q.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(q.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-right"><Link href={'/quotes/' + q.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
