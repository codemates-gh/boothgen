export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { format } from 'date-fns';

export async function GET(_req: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({ where: { portalToken: params.portalToken }, include: { client: { select: { firstName: true, lastName: true, email: true, phone: true } }, tenant: { select: { name: true, status: true, branding: { select: { companyName: true, logoUrl: true, primaryColor: true, secondaryColor: true, replyToEmail: true, supportPhone: true, websiteUrl: true } } } }, invoices: { orderBy: { createdAt: 'desc' }, take: 1, include: { lineItems: { orderBy: { sortOrder: 'asc' } } } }, contracts: { orderBy: { createdAt: 'desc' }, take: 1 }, gallery: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = event.invoices[0] ?? null;
  const con = event.contracts[0] ?? null;
  const b = event.tenant.branding;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  return NextResponse.json({
    booking: { title: event.title, status: event.status, eventDate: format(event.eventDate, 'EEEE, MMMM d, yyyy'), startTime: event.startTime ? format(event.startTime, 'h:mm a') : null, endTime: event.endTime ? format(event.endTime, 'h:mm a') : null, venueName: event.venueName, venueAddress: [event.venueAddress, event.venueCity, event.venueState].filter(Boolean).join(', ') || null, packageName: event.packageName, guestCount: event.guestCount },
    client: { firstName: event.client.firstName, displayName: event.client.firstName + ' ' + event.client.lastName },
    branding: { companyName: b?.companyName ?? event.tenant.name, logoUrl: b?.logoUrl ?? null, primaryColor: b?.primaryColor ?? '#F97316', contactEmail: b?.replyToEmail ?? null, contactPhone: b?.supportPhone ?? null },
    invoice: inv ? { invoiceNumber: inv.invoiceNumber, status: inv.status, totalFormatted: fmt(inv.totalCents), amountPaidFormatted: fmt(inv.amountPaidCents), balanceDueFormatted: fmt(inv.balanceDueCents), balanceDueCents: inv.balanceDueCents, isPaid: inv.status === 'PAID', dueDate: inv.dueDate ? format(inv.dueDate, 'MMMM d, yyyy') : null, canPay: inv.balanceDueCents > 0 && event.tenant.status !== 'SUSPENDED', lineItems: inv.lineItems, retainer: inv.retainerAmountCents ? { amountFormatted: fmt(inv.retainerAmountCents), isPaid: !!inv.retainerPaidAt } : null } : null,
    contract: con ? { title: con.title, status: con.status, renderedContent: con.status !== 'DRAFT' ? con.renderedContent : null, clientToken: con.clientToken, contractId: con.id, clientHasSigned: !!con.clientSignedAt, hostHasSigned: !!con.hostSignedAt, isFullyExecuted: con.status === 'FULLY_EXECUTED', canSign: !con.clientSignedAt && con.status !== 'VOIDED' && con.status !== 'DRAFT' && (!con.expiresAt || con.expiresAt > new Date()), pdfUrl: con.status === 'FULLY_EXECUTED' ? con.pdfUrl : null } : null,
    gallery: event.gallery ? { title: event.gallery.title, approvalStatus: event.gallery.approvalStatus, isPublished: event.gallery.isPublished } : null,
    meta: { tabs: { booking: true, invoice: !!inv, contract: !!con && con.status !== 'DRAFT', gallery: !!event.gallery?.isPublished } },
  }, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
