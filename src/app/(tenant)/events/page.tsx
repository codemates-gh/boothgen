export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Calendar, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function EventsPage() {
  const session = await requireTenantSession();
  const events = await prisma.event.findMany({ where: { tenantId: session.tenantId }, include: { client: true }, orderBy: { eventDate: 'desc' }, take: 100 });
  return (
    <>
      <TopBar title="Events" />
      <div className="p-8">
        <div className="flex justify-end mb-6"><Link href="/events/new"><Button><Plus className="w-4 h-4 mr-2"/>New Event</Button></Link></div>
        <Card><CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Calendar className="w-12 h-12 mx-auto mb-4 opacity-30"/><p className="text-lg font-medium mb-2">No events yet</p><Link href="/events/new"><Button className="mt-4">Create First Event</Button></Link></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Package</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold">{ev.title}</p><p className="text-xs text-gray-400">{ev.venueName ?? ''}</p></td>
                    <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{format(ev.eventDate,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{ev.packageName ?? '—'}</td>
                    <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
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
