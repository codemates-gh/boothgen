export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([]);

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const tid = session.tenantId;
  const mode = 'insensitive' as const;
  const filter = { contains: q, mode };

  const [clients, events, invoices, contracts] = await Promise.all([
    prisma.client.findMany({
      where: {
        tenantId: tid,
        OR: [{ firstName: filter }, { lastName: filter }, { email: filter }, { company: filter }],
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 5,
    }),
    prisma.event.findMany({
      where: { tenantId: tid, title: filter },
      select: { id: true, title: true, status: true, eventDate: true, client: { select: { firstName: true, lastName: true } } },
      take: 5,
    }),
    prisma.invoice.findMany({
      where: { tenantId: tid, invoiceNumber: filter },
      select: { id: true, invoiceNumber: true, status: true, totalCents: true, client: { select: { firstName: true, lastName: true } } },
      take: 5,
    }),
    prisma.contract.findMany({
      where: { tenantId: tid, title: filter },
      select: { id: true, title: true, status: true, client: { select: { firstName: true, lastName: true } } },
      take: 5,
    }),
  ]);

  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);

  const results: any[] = [
    ...clients.map(c => ({
      type: 'client',
      id: c.id,
      title: c.firstName + ' ' + c.lastName,
      subtitle: c.email,
      href: '/clients/' + c.id,
    })),
    ...events.map(e => ({
      type: 'event',
      id: e.id,
      title: e.title,
      subtitle: e.client.firstName + ' ' + e.client.lastName + ' · ' + new Date(e.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      href: '/events/' + e.id,
      status: e.status,
    })),
    ...invoices.map(inv => ({
      type: 'invoice',
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: inv.client.firstName + ' ' + inv.client.lastName + ' · ' + fmt(inv.totalCents),
      href: '/invoices/' + inv.id,
      status: inv.status,
    })),
    ...contracts.map(c => ({
      type: 'contract',
      id: c.id,
      title: c.title,
      subtitle: c.client.firstName + ' ' + c.client.lastName,
      href: '/contracts/' + c.id,
      status: c.status,
    })),
  ];

  return NextResponse.json(results);
}
