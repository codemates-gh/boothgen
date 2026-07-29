export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.tenantId;

  const [events, milestones, printLogs, expenses] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId, status: { in: ['BOOKED', 'COMPLETED', 'ARCHIVED'] } },
      select: { id: true, title: true, eventDate: true, status: true },
      orderBy: { eventDate: 'desc' },
    }),
    prisma.paymentMilestone.findMany({
      where: { invoice: { tenantId }, status: 'PAID' },
      select: { amountCents: true, invoice: { select: { eventId: true } } },
    }),
    prisma.eventPrintLog.findMany({
      where: { tenantId },
      include: { consumableProfile: { select: { costPerPrintCents: true } } },
    }),
    prisma.eventExpense.findMany({
      where: { tenantId },
      select: { eventId: true, amountCents: true, category: true, description: true },
    }),
  ]);

  // Group revenue by event
  const revenueByEvent: Record<string, number> = {};
  for (const m of milestones) {
    const eid = m.invoice.eventId;
    if (!eid) continue;
    revenueByEvent[eid] = (revenueByEvent[eid] ?? 0) + m.amountCents;
  }

  // Group print cost by event
  const printCostByEvent: Record<string, number> = {};
  const printCountByEvent: Record<string, number> = {};
  for (const pl of printLogs) {
    const cpp = pl.consumableProfile?.costPerPrintCents ?? 0;
    printCostByEvent[pl.eventId] = pl.printCount * cpp;
    printCountByEvent[pl.eventId] = pl.printCount;
  }

  // Group expenses by event
  const expensesByEvent: Record<string, number> = {};
  for (const e of expenses) {
    expensesByEvent[e.eventId] = (expensesByEvent[e.eventId] ?? 0) + e.amountCents;
  }

  const rows = events.map((ev) => {
    const revenue = revenueByEvent[ev.id] ?? 0;
    const printCost = printCostByEvent[ev.id] ?? 0;
    const otherExpenses = expensesByEvent[ev.id] ?? 0;
    const totalCost = printCost + otherExpenses;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
    return {
      id: ev.id,
      title: ev.title,
      eventDate: ev.eventDate,
      status: ev.status,
      revenueCents: revenue,
      printCostCents: printCost,
      printCount: printCountByEvent[ev.id] ?? 0,
      otherExpensesCents: otherExpenses,
      totalCostCents: totalCost,
      profitCents: profit,
      marginPct: margin,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      revenueCents: acc.revenueCents + r.revenueCents,
      totalCostCents: acc.totalCostCents + r.totalCostCents,
      profitCents: acc.profitCents + r.profitCents,
    }),
    { revenueCents: 0, totalCostCents: 0, profitCents: 0 }
  );

  return NextResponse.json({ rows, totals });
}
