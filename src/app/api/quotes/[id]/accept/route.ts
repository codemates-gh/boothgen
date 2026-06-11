export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { signatureData, clientName, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({
    where: { id: params.id },
    include: { event: true, tenant: { include: { branding: true, contractTemplates: { where: { isDefault: true }, take: 1 } } }, client: true },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (quote.status !== 'SENT' && quote.status !== 'VIEWED') return NextResponse.json({ error: 'Quote cannot be accepted' }, { status: 400 });
  const now = new Date();
  await prisma.quote.update({
    where: { id: params.id },
    data: { status: 'ACCEPTED', acceptedAt: now, clientSignatureData: signatureData, clientSignedAt: now, clientIpAddress: ip, clientName },
  });
  // Update event status to QUOTED -> BOOKED
  await prisma.event.update({ where: { id: quote.eventId }, data: { status: 'BOOKED' } });
  // Auto-generate contract from default template
  const template = quote.tenant.contractTemplates[0];
  if (template) {
    const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
    const eventDate = quote.event.eventDate;
    let body = template.bodyHtml
      .replace(/{{client.full_name}}/g, quote.client.firstName + ' ' + quote.client.lastName)
      .replace(/{{client.first_name}}/g, quote.client.firstName)
      .replace(/{{client.email}}/g, quote.client.email)
      .replace(/{{event.title}}/g, quote.event.title)
      .replace(/{{event.date}}/g, eventDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/{{event.start_time}}/g, quote.event.startTime ? new Date(quote.event.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
      .replace(/{{event.end_time}}/g, quote.event.endTime ? new Date(quote.event.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '')
      .replace(/{{event.venue_name}}/g, quote.event.venueName || '')
      .replace(/{{event.venue_address}}/g, quote.event.venueAddress || '')
      .replace(/{{event.venue_city}}/g, quote.event.venueCity || '')
      .replace(/{{event.venue_state}}/g, quote.event.venueState || '')
      .replace(/{{event.package_name}}/g, quote.event.packageName || '')
      .replace(/{{event.guest_count}}/g, String(quote.event.guestCount || ''))
      .replace(/{{invoice.total}}/g, fmt(quote.totalCents))
      .replace(/{{host.company_name}}/g, quote.tenant.branding?.companyName || quote.tenant.name)
      .replace(/{{host.email}}/g, quote.tenant.branding?.replyToEmail || '')
      .replace(/{{today}}/g, now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
    await prisma.contract.create({
      data: {
        tenantId: quote.tenantId, eventId: quote.eventId, clientId: quote.clientId,
        title: 'Services Agreement — ' + quote.event.title,
        bodyHtml: body, status: 'DRAFT',
      },
    });
  }
  return NextResponse.json({ success: true });
}
