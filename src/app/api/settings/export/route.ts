export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

function csv(rows: string[][]): string {
  return rows.map(row =>
    row.map(cell => {
      const s = cell == null ? '' : String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\r\n');
}

function fmt(cents: number | null) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function fmtDate(d: Date | string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = session.tenantId;
  const type = req.nextUrl.searchParams.get('type') ?? 'clients';

  let content = '';
  let filename = '';

  if (type === 'clients') {
    const rows = await prisma.client.findMany({
      where: { tenantId: tid },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { firstName: true, lastName: true, email: true, phone: true, company: true, createdAt: true },
    });
    content = csv([
      ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Created Date'],
      ...rows.map(r => [r.firstName, r.lastName, r.email, r.phone ?? '', r.company ?? '', fmtDate(r.createdAt)]),
    ]);
    filename = 'clients.csv';
  } else if (type === 'events') {
    const rows = await prisma.event.findMany({
      where: { tenantId: tid },
      orderBy: { eventDate: 'desc' },
      select: { title: true, status: true, eventDate: true, venueName: true, venueCity: true, venueState: true, packageName: true, guestCount: true, estimatedValueCents: true, client: { select: { firstName: true, lastName: true, email: true } } },
    });
    content = csv([
      ['Event Title', 'Date', 'Status', 'Client Name', 'Client Email', 'Venue', 'City', 'State', 'Package', 'Guest Count', 'Estimated Value'],
      ...rows.map(r => [
        r.title,
        fmtDate(r.eventDate),
        r.status,
        `${r.client.firstName} ${r.client.lastName}`,
        r.client.email,
        r.venueName ?? '',
        r.venueCity ?? '',
        r.venueState ?? '',
        r.packageName ?? '',
        r.guestCount?.toString() ?? '',
        fmt(r.estimatedValueCents),
      ]),
    ]);
    filename = 'events.csv';
  } else if (type === 'invoices') {
    const rows = await prisma.invoice.findMany({
      where: { tenantId: tid },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true, createdAt: true, status: true, totalCents: true, amountPaidCents: true, balanceDueCents: true, currency: true, client: { select: { firstName: true, lastName: true } } },
    });
    content = csv([
      ['Invoice #', 'Date', 'Client Name', 'Status', 'Total', 'Amount Paid', 'Balance Due', 'Currency'],
      ...rows.map(r => [
        r.invoiceNumber,
        fmtDate(r.createdAt),
        `${r.client.firstName} ${r.client.lastName}`,
        r.status,
        fmt(r.totalCents),
        fmt(r.amountPaidCents),
        fmt(r.balanceDueCents),
        (r.currency ?? 'USD').toUpperCase(),
      ]),
    ]);
    filename = 'invoices.csv';
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
