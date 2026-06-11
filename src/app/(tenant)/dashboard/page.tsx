export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Calendar, Users, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [upcomingEvents, totalClients, newLeads, tenant, revenue] = await Promise.all([
    prisma.event.findMany({ where: { tenantId, eventDate: { gte: now }, status: { not: 'CANCELLED' } }, include: { client: true }, orderBy: { eventDate: 'asc' }, take: 8 }),
    prisma.client.count({ where: { tenantId } }),
    prisma.leadSubmission.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { branding: true } }),
    prisma.payment.aggregate({ where: { tenantId, paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
  ]);

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const stats = [
    { label: 'Upcoming Events', value: upcomingEvents.length, icon: Calendar, color: 'text-brand' },
    { label: 'Total Clients', value: totalClients, icon: Users, color: 'text-blue-500' },
    { label: 'New Leads (Month)', value: newLeads, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Revenue (Month)', value: fmt(revenue._sum.amountCents ?? 0), icon: DollarSign, color: 'text-green-500' },
  ];

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-8 space-y-8">
        {tenant?.status === 'TRIAL' && tenant.trialEndsAt && (
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-center justify-between">
            <div><p className="font-semibold text-brand-dark">Free Trial Active</p><p className="text-sm text-gray-600">Trial ends {format(tenant.trialEndsAt, 'MMMM d, yyyy')}</p></div>
            <Link href="/settings/billing"><Button size="sm">Upgrade Plan</Button></Link>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map(s => (
            <Card key={s.label}><CardContent className="pt-6"><div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{s.label}</p><s.icon className={'w-5 h-5 ' + s.color} /></div><p className="text-2xl font-bold">{s.value}</p></CardContent></Card>
          ))}
        </div>
        <Card>
          <CardHeader><div className="flex items-center justify-between"><CardTitle>Upcoming Events</CardTitle><Link href="/events/new"><Button size="sm"><Plus className="w-4 h-4 mr-1"/>New Event</Button></Link></div></CardHeader>
          <CardContent className="p-0">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><Calendar className="w-10 h-10 mx-auto mb-3 opacity-40"/><p>No upcoming events. <Link href="/events/new" className="text-brand hover:underline">Create one</Link></p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {upcomingEvents.map(ev => (
                    <tr key={ev.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><p className="font-medium">{ev.title}</p><p className="text-sm text-gray-500">{ev.venueName ?? 'Venue TBD'}</p></td>
                      <td className="px-6 py-4 text-sm">{ev.client.firstName} {ev.client.lastName}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{format(ev.eventDate, 'MMM d, yyyy')}</td>
                      <td className="px-6 py-4"><Badge variant={SC[ev.status]}>{ev.status}</Badge></td>
                      <td className="px-6 py-4 text-right"><Link href={'/events/' + ev.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
