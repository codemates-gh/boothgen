export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Calendar, ArrowRight, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function EventsPage() {
  const session = await requireTenantSession();
  const isAdmin = session.tenantRole === 'HOST_ADMIN';

  const events = await prisma.event.findMany({
    where: {
      tenantId: session.tenantId,
      // Team members only see events assigned to them
      ...(!isAdmin ? { assignedToUserId: session.userId } : {}),
    },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { eventDate: 'asc' },
    take: 100,
  });

  const emptyMessage = isAdmin
    ? 'No events yet'
    : 'No events assigned to you yet';

  return (
    <>
      <TopBar title="Events" />
      <div className="p-4 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            {!isAdmin && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" /> Showing your assigned events
              </p>
            )}
          </div>
          {isAdmin && (
            <Link href="/events/new"><Button><Plus className="w-4 h-4 mr-2"/>New Event</Button></Link>
          )}
        </div>
        <Card><CardContent className="p-0">
          {events.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30"/>
              <p className="text-lg font-medium mb-2">{emptyMessage}</p>
              {isAdmin && <Link href="/events/new"><Button className="mt-4">Create First Event</Button></Link>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    {isAdmin && <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assigned To</th>}
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-semibold">{ev.title}</p><p className="text-xs text-gray-400">{ev.venueName ?? ''}</p></td>
                      <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{format(ev.eventDate,'MMM d, yyyy')}</td>
                      <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status.replace('_',' ')}</Badge></td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {ev.assignedTo
                            ? <span className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5 text-green-500"/>{ev.assignedTo.name}</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                      )}
                      <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
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
