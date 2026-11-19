import { prisma } from '@/lib/prisma/client';

// Geniefied usage ledger (Super Admin → Genie Usage): per event, renders done / blocked / failed, trial renders and the
// estimated provider cost, for events with renders since `since`
export async function aiUsage(since: Date) {
  const groups = await prisma.genieAiRender.groupBy({
    by: ['eventId', 'status', 'trial'], where: { createdAt: { gte: since } },
    _count: { _all: true }, _sum: { estimatedCostCents: true },
  });
  const ids = [...new Set(groups.map(g => g.eventId))];
  const events = ids.length ? await prisma.event.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, eventDate: true, tenant: { select: { name: true, branding: { select: { companyName: true } } } } },
  }) : [];
  return events.map(e => {
    const mine = groups.filter(g => g.eventId === e.id);
    const n = (status: string) => mine.filter(g => g.status === status).reduce((t, g) => t + g._count._all, 0);
    return {
      eventId: e.id, title: e.title, eventDate: e.eventDate, operator: e.tenant.branding?.companyName || e.tenant.name,
      done: n('done'), blocked: n('blocked'), failed: n('failed'),
      trial: mine.filter(g => g.trial && g.status === 'done').reduce((t, g) => t + g._count._all, 0),
      costCents: mine.reduce((t, g) => t + (g._sum.estimatedCostCents ?? 0), 0),
    };
  }).sort((a, b) => +b.eventDate - +a.eventDate);
}
