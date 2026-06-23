export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';

function monthKey(d: Date) { return format(d, 'MMM yyyy'); }
function monthLabel(d: Date) { return format(d, 'MMM'); }

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = session.tenantId;
  const now = new Date();

  // Last 12 months range
  const from12 = startOfMonth(subMonths(now, 11));

  const [milestones, events, leads, totalClients] = await Promise.all([
    prisma.paymentMilestone.findMany({
      where: { invoice: { tenantId }, status: 'PAID', paidAt: { gte: from12 } },
      select: { amountCents: true, paidAt: true },
    }),
    prisma.event.findMany({
      where: { tenantId, eventDate: { gte: from12 } },
      select: { status: true, eventDate: true, estimatedValueCents: true },
    }),
    prisma.leadSubmission.findMany({
      where: { tenantId, createdAt: { gte: from12 } },
      select: { createdAt: true },
    }),
    prisma.client.count({ where: { tenantId } }),
  ]);

  // Build month buckets (last 12 months)
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(now, 11 - i);
    return { key: monthKey(d), label: monthLabel(d), date: d };
  });

  // Revenue by month
  const revByMonth: Record<string, number> = {};
  for (const m of milestones) {
    if (!m.paidAt) continue;
    const k = monthKey(m.paidAt);
    revByMonth[k] = (revByMonth[k] ?? 0) + m.amountCents;
  }

  // Events by month (by eventDate)
  const bookedByMonth: Record<string, number> = {};
  const leadsByMonth: Record<string, number> = {};
  for (const ev of events) {
    const k = monthKey(new Date(ev.eventDate));
    if (['BOOKED','IN_PROGRESS','COMPLETED'].includes(ev.status)) {
      bookedByMonth[k] = (bookedByMonth[k] ?? 0) + 1;
    }
  }
  for (const l of leads) {
    const k = monthKey(l.createdAt);
    leadsByMonth[k] = (leadsByMonth[k] ?? 0) + 1;
  }

  // Monthly chart data
  const monthly = months.map(m => ({
    month: m.label,
    revenue: Math.round((revByMonth[m.key] ?? 0) / 100),
    bookings: bookedByMonth[m.key] ?? 0,
    leads: leadsByMonth[m.key] ?? 0,
  }));

  // All-time event status distribution
  const allEvents = await prisma.event.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { status: true },
  });
  const statusDist = allEvents.map(e => ({ status: e.status, count: e._count.status }));

  // Conversion funnel (all-time)
  const [totalLeads, totalQuoted, totalBooked, totalCompleted] = await Promise.all([
    prisma.leadSubmission.count({ where: { tenantId } }),
    prisma.event.count({ where: { tenantId, status: { in: ['QUOTED','BOOKED','IN_PROGRESS','COMPLETED'] } } }),
    prisma.event.count({ where: { tenantId, status: { in: ['BOOKED','IN_PROGRESS','COMPLETED'] } } }),
    prisma.event.count({ where: { tenantId, status: 'COMPLETED' } }),
  ]);
  const funnel = [
    { stage: 'Leads', count: totalLeads },
    { stage: 'Quoted', count: totalQuoted },
    { stage: 'Booked', count: totalBooked },
    { stage: 'Completed', count: totalCompleted },
  ];

  // Top-line KPIs
  const totalRevenue = milestones.reduce((s, m) => s + m.amountCents, 0);
  const avgBookingValue = totalBooked > 0
    ? events.filter(e => ['BOOKED','IN_PROGRESS','COMPLETED'].includes(e.status)).reduce((s, e) => s + (e.estimatedValueCents ?? 0), 0) / totalBooked
    : 0;

  return NextResponse.json({ monthly, statusDist, funnel, kpis: { totalRevenue12m: totalRevenue, totalClients, totalBooked, avgBookingValue: Math.round(avgBookingValue) } });
}
