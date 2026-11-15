import { prisma } from '@/lib/prisma/client';
import { IPADS_PER_PAYMENT, isComp } from '@/lib/genie/payments';

// Genie usage per event, for Super Admin → Genie Usage (G: analytics from launch; review the text cap after at least
// 20 paid events). Counts come from what's already recorded: sessions, uploaded photos, shares and payments.

export type UsageRow = {
  eventId: string; title: string; eventDate: Date;
  tenantId: string; operator: string; product: string;
  ipads: number; sessions: number; photos: number;
  texts: number; emails: number; failed: number;
  paidCents: number; payments: number; ipadsCovered: number | null;
  paymentList: { id: string; amountCents: number; status: string; paidAt: Date | null; comp: boolean }[];
};

export async function genieUsage(since: Date): Promise<UsageRow[]> {
  const events = await prisma.event.findMany({
    where: { eventDate: { gte: since }, genieSettings: { isNot: null } },
    orderBy: { eventDate: 'desc' },
    take: 500,
    select: { id: true, title: true, eventDate: true, tenantId: true, tenant: { select: { name: true, product: true } } },
  });
  const ids = events.map(e => e.id);
  const where = { eventId: { in: ids } };
  const [devices, sessions, photos, shares, payments, paymentRows] = await Promise.all([
    prisma.genieEventDevice.groupBy({ by: ['eventId'], where, _count: { _all: true } }),
    prisma.genieSession.groupBy({ by: ['eventId'], where, _count: { _all: true } }),
    // Guest photos (the gallery image of each session), not the single shots or print sheets
    prisma.galleryAsset.groupBy({ by: ['galleryId'], where: { gallery: { eventId: { in: ids } }, genieKind: 'gallery' }, _count: { _all: true } }),
    prisma.genieShare.groupBy({ by: ['eventId', 'channel', 'status'], where, _count: { _all: true } }),
    prisma.genieEventPayment.groupBy({ by: ['eventId'], where: { ...where, status: 'paid' }, _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.genieEventPayment.findMany({ where: { ...where, status: { in: ['paid', 'refunded'] } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const galleries = await prisma.gallery.findMany({ where: { eventId: { in: ids } }, select: { id: true, eventId: true } });
  const galleryEvent = new Map(galleries.map(g => [g.id, g.eventId]));
  const count = (rows: { eventId: string; _count: { _all: number } }[]) => new Map(rows.map(r => [r.eventId, r._count._all]));
  const devicesBy = count(devices), sessionsBy = count(sessions);
  const photosBy = new Map<string, number>();
  for (const p of photos) { const e = galleryEvent.get(p.galleryId); if (e) photosBy.set(e, (photosBy.get(e) ?? 0) + p._count._all); }
  const paymentsBy = new Map(payments.map(p => [p.eventId, p]));

  return events.map(e => {
    const sh = shares.filter(s => s.eventId === e.id);
    const sent = (channel: string) => sh.filter(s => s.channel === channel && s.status !== 'failed').reduce((n, s) => n + s._count._all, 0);
    const pay = paymentsBy.get(e.id);
    const paysPerEvent = e.tenant.product === 'genie';
    return {
      eventId: e.id, title: e.title, eventDate: e.eventDate,
      tenantId: e.tenantId, operator: e.tenant.name, product: e.tenant.product,
      ipads: devicesBy.get(e.id) ?? 0,
      sessions: sessionsBy.get(e.id) ?? 0,
      photos: photosBy.get(e.id) ?? 0,
      texts: sent('sms'),
      emails: sent('email'),
      failed: sh.filter(s => s.status === 'failed').reduce((n, s) => n + s._count._all, 0),
      paidCents: pay?._sum.amountCents ?? 0,
      payments: pay?._count._all ?? 0,
      ipadsCovered: paysPerEvent ? IPADS_PER_PAYMENT * Math.max(1, pay?._count._all ?? 0) : null,
      paymentList: paymentRows.filter(p => p.eventId === e.id).map(p => ({ id: p.id, amountCents: p.amountCents, status: p.status, paidAt: p.paidAt, comp: isComp(p) })),
    };
  });
}
