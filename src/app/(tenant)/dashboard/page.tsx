export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import WeatherWidget from '@/components/dashboard/WeatherWidget';
import Link from 'next/link';
import {
  Calendar, Users, DollarSign, TrendingUp, Plus, ArrowRight, Inbox,
  AlertTriangle, Clock, FileText, Camera, CheckCircle, Layers,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const SC: Record<string,any> = { LEAD:'info', QUOTED:'warning', BOOKED:'brand', IN_PROGRESS:'brand', COMPLETED:'success', CANCELLED:'danger' };

export default async function DashboardPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId;
  const now = new Date();
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysOut = new Date(now.getTime() + 7  * 86400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);
  const threeDaysAgo = new Date(now.getTime() - 3  * 86400_000);
  const todayStart   = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd     = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const [
    upcomingEvents, totalClients, newLeads, tenant,
    revenue, bookedPipeline, outstanding, totalLeads, totalBooked,
    recentLeads,
    overdueByMilestone, dueSoonByMilestone,
    pendingContracts,
    staleLeads,
    atRiskGalleries,
    todayEvents,
    // Events where ANY design is REVISION_REQUESTED (we post-filter to latest version)
    eventsWithRevision,
    // Designs approved in the last 30 days
    recentlyApproved,
  ] = await Promise.all([
    prisma.event.findMany({ where: { tenantId, eventDate: { gte: now }, status: { not: 'CANCELLED' } }, include: { client: true }, orderBy: { eventDate: 'asc' }, take: 8 }),
    prisma.client.count({ where: { tenantId } }),
    prisma.leadSubmission.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { branding: true } }),
    prisma.payment.aggregate({ where: { tenantId, paidAt: { gte: monthStart } }, _sum: { amountCents: true } }),
    prisma.event.aggregate({ where: { tenantId, status: { in: ['BOOKED', 'IN_PROGRESS'] } }, _sum: { estimatedValueCents: true } }),
    prisma.invoice.aggregate({ where: { tenantId, status: { notIn: ['PAID', 'CANCELLED'] }, balanceDueCents: { gt: 0 } }, _sum: { balanceDueCents: true } }),
    prisma.event.count({ where: { tenantId, status: { not: 'CANCELLED' } } }),
    prisma.event.count({ where: { tenantId, status: { in: ['BOOKED', 'IN_PROGRESS', 'COMPLETED'] } } }),
    prisma.leadSubmission.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, firstName: true, lastName: true, email: true, eventDate: true, eventType: true, status: true, createdAt: true } }),
    // Overdue milestones — use milestone dueDate since invoice.dueDate is nullable
    prisma.paymentMilestone.findMany({ where: { tenantId, dueDate: { lt: now }, status: { notIn: ['PAID', 'REFUNDED'] }, invoice: { status: { notIn: ['PAID', 'CANCELLED'] } } }, include: { invoice: { include: { client: { select: { firstName: true, lastName: true } } } } }, orderBy: { dueDate: 'asc' }, take: 20 }),
    // Milestones due in the next 7 days (not yet paid)
    prisma.paymentMilestone.findMany({ where: { tenantId, dueDate: { gte: now, lte: sevenDaysOut }, status: { notIn: ['PAID', 'REFUNDED'] }, invoice: { status: { notIn: ['PAID', 'CANCELLED'] } } }, include: { invoice: { include: { client: { select: { firstName: true, lastName: true } } } } }, orderBy: { dueDate: 'asc' }, take: 20 }),
    // Contracts awaiting any signature
    prisma.contract.findMany({ where: { tenantId, status: { in: ['SENT_TO_CLIENT', 'CLIENT_SIGNED'] } }, include: { client: { select: { firstName: true, lastName: true } }, event: { select: { title: true } } }, orderBy: { updatedAt: 'desc' }, take: 10 }),
    // New leads with no contact for 3+ days
    prisma.leadSubmission.findMany({ where: { tenantId, status: 'NEW', createdAt: { lt: threeDaysAgo } }, select: { id: true, firstName: true, lastName: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: 10 }),
    // Galleries that are expired and still have photos (pending deletion)
    prisma.gallery.findMany({ where: { tenantId, isExpired: true, assets: { some: {} } }, include: { event: { select: { title: true } }, _count: { select: { assets: true } } }, take: 10 }),
    // Events happening today
    prisma.event.findMany({ where: { tenantId, eventDate: { gte: todayStart, lte: todayEnd }, status: { not: 'CANCELLED' } }, include: { client: true }, orderBy: { startTime: 'asc' } }),
    // Events that have at least one REVISION_REQUESTED design — we'll post-filter to latest version only
    prisma.event.findMany({
      where: { tenantId, templateDesigns: { some: { status: 'REVISION_REQUESTED' } } },
      include: {
        client: { select: { firstName: true, lastName: true } },
        templateDesigns: { orderBy: { version: 'desc' }, take: 1 },
      },
      take: 10,
    }),
    // Designs approved in the last 30 days
    prisma.templateDesign.findMany({
      where: { tenantId, status: 'APPROVED', approvedAt: { gte: thirtyDaysAgo } },
      include: { event: { select: { id: true, title: true, client: { select: { firstName: true, lastName: true } } } } },
      orderBy: { approvedAt: 'desc' },
      take: 10,
    }),
  ]);

  // Deduplicate milestone results to one entry per invoice (earliest overdue/due-soon milestone wins)
  const overdueInvoices = (() => {
    const seen = new Set<string>();
    return overdueByMilestone
      .filter(ms => { const first = !seen.has(ms.invoiceId); seen.add(ms.invoiceId); return first; })
      .slice(0, 10)
      .map(ms => ({ id: ms.invoiceId, client: ms.invoice.client, balanceDueCents: ms.invoice.balanceDueCents, dueDate: ms.dueDate }));
  })();

  const dueSoonInvoices = (() => {
    const overdueIds = new Set(overdueInvoices.map(i => i.id));
    const seen = new Set<string>();
    return dueSoonByMilestone
      .filter(ms => {
        if (overdueIds.has(ms.invoiceId)) return false;
        const first = !seen.has(ms.invoiceId); seen.add(ms.invoiceId); return first;
      })
      .slice(0, 10)
      .map(ms => ({ id: ms.invoiceId, client: ms.invoice.client, balanceDueCents: ms.invoice.balanceDueCents, dueDate: ms.dueDate }));
  })();

  // Only alert on events where the LATEST design version is still REVISION_REQUESTED
  const revisionRequested = eventsWithRevision.filter(
    e => e.templateDesigns[0]?.status === 'REVISION_REQUESTED'
  );

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const conversionRate = totalLeads > 0 ? Math.round((totalBooked / totalLeads) * 100) : 0;

  const stats = [
    { label: 'Upcoming Events', value: upcomingEvents.length, icon: Calendar, color: 'text-brand', href: '/events' },
    { label: 'Total Clients',   value: totalClients,          icon: Users,     color: 'text-blue-500', href: '/clients' },
    { label: 'New Leads (Month)',value: newLeads,             icon: TrendingUp,color: 'text-purple-500',href: '/leads' },
    { label: 'Revenue (Month)', value: fmt(revenue._sum.amountCents ?? 0), icon: DollarSign, color: 'text-green-500', href: '/invoices' },
    { label: 'Booked Pipeline', value: fmt(bookedPipeline._sum.estimatedValueCents ?? 0), icon: TrendingUp, color: 'text-orange-500', href: '/events' },
    { label: 'Outstanding',     value: fmt(outstanding._sum.balanceDueCents ?? 0), icon: DollarSign, color: 'text-red-500', href: '/invoices' },
    { label: 'Conversion Rate', value: conversionRate + '%', icon: TrendingUp, color: 'text-teal-500', href: '/events' },
  ];

  type AttentionItem = { key: string; icon: any; iconCls: string; rowCls: string; title: string; detail: string; href: string };
  const attention: AttentionItem[] = [
    ...overdueInvoices.map(inv => ({
      key: 'inv-' + inv.id,
      icon: AlertTriangle, iconCls: 'text-red-500',
      rowCls: 'border-l-4 border-red-400 bg-red-50',
      title: `Overdue payment — ${inv.client.firstName} ${inv.client.lastName}`,
      detail: `${fmt(inv.balanceDueCents)} past due${inv.dueDate ? ' since ' + format(inv.dueDate, 'MMM d') : ''}`,
      href: `/invoices/${inv.id}`,
    })),
    ...atRiskGalleries.map(g => ({
      key: 'gal-' + g.id,
      icon: Camera, iconCls: 'text-red-500',
      rowCls: 'border-l-4 border-red-400 bg-red-50',
      title: `Gallery photos scheduled for deletion — ${g.event.title}`,
      detail: `${g._count.assets} photo${g._count.assets !== 1 ? 's' : ''} will be permanently deleted soon`,
      href: `/gallery/${g.id}`,
    })),
    ...revisionRequested.map(e => {
      const d = e.templateDesigns[0];
      return {
        key: 'rev-' + e.id,
        icon: Layers, iconCls: 'text-orange-500',
        rowCls: 'border-l-4 border-orange-400 bg-orange-50',
        title: `Design revision requested — ${e.client.firstName} ${e.client.lastName}`,
        detail: `Version ${d.version} · ${e.title}${d.revisionNote ? ' — "' + d.revisionNote + '"' : ''}`,
        href: `/events/${e.id}/designs`,
      };
    }),
    ...pendingContracts.map(c => ({
      key: 'con-' + c.id,
      icon: FileText, iconCls: 'text-orange-500',
      rowCls: 'border-l-4 border-orange-400 bg-orange-50',
      title: c.status === 'SENT_TO_CLIENT'
        ? `Contract awaiting client signature — ${c.client.firstName} ${c.client.lastName}`
        : `Contract signed by client — awaiting your countersignature`,
      detail: c.event?.title ?? c.title,
      href: `/contracts/${c.id}`,
    })),
    ...dueSoonInvoices.map(inv => ({
      key: 'due-' + inv.id,
      icon: Clock, iconCls: 'text-yellow-600',
      rowCls: 'border-l-4 border-yellow-400 bg-yellow-50',
      title: `Payment due soon — ${inv.client.firstName} ${inv.client.lastName}`,
      detail: `${fmt(inv.balanceDueCents)} due ${inv.dueDate ? format(inv.dueDate, 'MMM d') : ''}`,
      href: `/invoices/${inv.id}`,
    })),
    ...staleLeads.map(l => ({
      key: 'lead-' + l.id,
      icon: Inbox, iconCls: 'text-purple-500',
      rowCls: 'border-l-4 border-purple-400 bg-purple-50',
      title: `New lead not contacted — ${l.firstName} ${l.lastName}`,
      detail: `Submitted ${formatDistanceToNow(l.createdAt)} ago with no response`,
      href: `/leads/${l.id}`,
    })),
  ];

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="p-4 sm:p-8 space-y-6">

        {/* Trial banner */}
        {tenant?.status === 'TRIAL' && tenant.trialEndsAt && (
          <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">
            <div><p className="font-semibold text-brand-dark">Free Trial Active</p><p className="text-sm text-gray-600">Trial ends {format(tenant.trialEndsAt, 'MMMM d, yyyy')}</p></div>
            <Link href="/settings/billing"><Button size="sm">Upgrade Plan</Button></Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
          {stats.map(s => (
            <Link key={s.label} href={s.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium text-gray-500">{s.label}</p><s.icon className={'w-5 h-5 ' + s.color} /></div>
                  <p className="text-2xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Weather */}
        <WeatherWidget />

        {/* Today's Events */}
        {todayEvents.length > 0 && (
          <Card className="border-brand/30 bg-brand/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-brand-dark">
                <Calendar className="w-4 h-4 text-brand" />
                Today — {format(now, 'EEEE, MMMM d')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {todayEvents.map((ev, i) => (
                <Link key={ev.id} href={`/events/${ev.id}`}>
                  <div className={`flex items-center justify-between px-6 py-4 hover:bg-brand/10 transition-colors ${i < todayEvents.length - 1 ? 'border-b border-brand/10' : ''}`}>
                    <div>
                      <p className="font-semibold text-gray-900">{ev.title}</p>
                      <p className="text-sm text-gray-500">{ev.client.firstName} {ev.client.lastName}{ev.venueName ? ` · ${ev.venueName}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={SC[ev.status]}>{ev.status}</Badge>
                      <ArrowRight className="w-4 h-4 text-brand" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Requires Attention */}
        {attention.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Requires Attention
                <span className="ml-auto text-xs font-normal text-gray-400">{attention.length} item{attention.length !== 1 ? 's' : ''}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {attention.map((item, i) => (
                <Link key={item.key} href={item.href}>
                  <div className={`flex items-center gap-4 px-6 py-3.5 hover:brightness-95 transition-all cursor-pointer ${item.rowCls} ${i < attention.length - 1 ? 'border-b border-white/60' : ''}`}>
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${item.iconCls}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.detail}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* All clear */}
        {attention.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            You're all caught up — no overdue payments, unsigned contracts, or pending actions.
          </div>
        )}

        {/* Recent Activity */}
        {recentlyApproved.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Recent Activity
                <span className="ml-auto text-xs font-normal text-gray-400">last 30 days</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentlyApproved.map((d, i) => (
                <Link key={d.id} href={`/events/${d.event.id}/designs`}>
                  <div className={`flex items-center gap-4 px-6 py-3.5 border-l-4 border-green-400 bg-green-50 hover:brightness-95 transition-all cursor-pointer ${i < recentlyApproved.length - 1 ? 'border-b border-white/60' : ''}`}>
                    <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">Design approved — {d.event.client.firstName} {d.event.client.lastName}</p>
                      <p className="text-xs text-gray-500">Version {d.version} · {d.event.title} · approved {d.approvedAt ? formatDistanceToNow(d.approvedAt) + ' ago' : ''}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Events</CardTitle>
              <Link href="/events/new"><Button size="sm"><Plus className="w-4 h-4 mr-1"/>New Event</Button></Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40"/>
                <p>No upcoming events. <Link href="/events/new" className="text-brand hover:underline">Create one</Link></p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Leads */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Leads</CardTitle>
              <Link href="/leads"><Button variant="outline" size="sm">View All <ArrowRight className="w-3.5 h-3.5 ml-1"/></Button></Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLeads.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40"/>
                <p>No leads yet. Share your inquiry form to start collecting leads.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead><tr className="border-b"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Event Date</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="px-6 py-3"></th></tr></thead>
                  <tbody>
                    {recentLeads.map(lead => {
                      const statusCls: Record<string,string> = { NEW:'bg-blue-50 text-blue-700', CONTACTED:'bg-yellow-50 text-yellow-700', QUOTED:'bg-purple-50 text-purple-700', CONVERTED:'bg-green-50 text-green-700', CLOSED_LOST:'bg-gray-100 text-gray-500' };
                      return (
                        <tr key={lead.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-6 py-4"><p className="font-medium">{lead.firstName} {lead.lastName}</p><p className="text-xs text-gray-400">{lead.email}</p></td>
                          <td className="px-6 py-4 text-sm text-gray-700">{lead.eventDate ? format(new Date(lead.eventDate), 'MMM d, yyyy') : '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{lead.eventType ?? '—'}</td>
                          <td className="px-6 py-4"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCls[lead.status] ?? 'bg-gray-100 text-gray-500'}`}>{lead.status.replace('_', ' ')}</span></td>
                          <td className="px-6 py-4 text-right"><Link href={'/leads/' + lead.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </>
  );
}
