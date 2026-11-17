export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookEvent, milestoneStatusFor, sentInvoiceFields } from '@/lib/invoices/payments';
import { z } from 'zod';
import { sendHostNotificationEmail } from '@/lib/email/send';
import { triggerAutomation, scheduleEventDateAutomations } from '@/lib/inngest/trigger';
import { closedForClients } from '@/lib/genius';
import { stripMergeTagSpans } from '@/lib/contracts/merge-tags';
import { initialLabels, type ClientInitial } from '@/lib/contracts/initials';

const Schema = z.object({
  clientToken: z.string().min(1).max(256),
  signatureDataUrl: z.string().min(1),
  signerName: z.string().min(1).max(200),
  // One per Initial Here box, in document order
  initials: z.array(z.object({ initials: z.string().max(10), initialedAt: z.string().max(40).optional() })).max(200).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { clientToken, signatureDataUrl, initials = [] } = parsed.data;

  const contract = await prisma.contract.findFirst({
    where: { id: params.id, clientToken },
    include: {
      event: { include: { client: true } },
      tenant: {
        include: {
          branding: { select: { companyName: true, balanceDueDaysBeforeEvent: true } },
          memberships: { where: { role: 'HOST_ADMIN' }, include: { user: { select: { email: true } } } },
        },
      },
    },
  });
  if (!contract) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  { const closed = await closedForClients(contract.tenantId); if (closed) return closed; } // Genie-only account: CRM is closed
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already signed' }, { status: 400 });

  const now = new Date();
  // Every Initial Here box in the contract the client saw must be initialed
  const labels = initialLabels(stripMergeTagSpans(contract.renderedContent || contract.templateContent || ''));
  if (initials.length !== labels.length || initials.some(i => !i.initials.trim())) {
    return NextResponse.json({ error: 'Please initial every highlighted section before signing.' }, { status: 400 });
  }
  const clientInitials: ClientInitial[] = labels.map((label, n) => {
    const at = initials[n].initialedAt ? new Date(initials[n].initialedAt!) : null;
    // The tap time from the browser, if it's sensible (within the last day, not in the future); otherwise now
    const ok = at && !isNaN(at.getTime()) && at <= now && now.getTime() - at.getTime() < 86400_000;
    return { label, initials: initials[n].initials.trim().slice(0, 10), initialedAt: (ok ? at! : now).toISOString(), ipAddress: ip };
  });
  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
  const newStatus = contract.hostSignedAt ? 'FULLY_EXECUTED' : 'CLIENT_SIGNED';

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id: params.id },
      data: {
        clientSignatureData: signatureDataUrl, clientSignedAt: now, clientIpAddress: ip, clientUserAgent: userAgent, status: newStatus,
        ...(clientInitials.length ? { clientInitials } : {}),
      },
    });

    // Auto-create invoice from accepted quote if none exists for this event
    if (contract.eventId) {
      const existing = await tx.invoice.findFirst({ where: { eventId: contract.eventId } });
      if (!existing) {
        const quote = await tx.quote.findFirst({
          where: { eventId: contract.eventId, status: 'ACCEPTED' },
          include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
        });
        if (quote) {
          const count = await tx.invoice.count({ where: { tenantId: contract.tenantId } });
          const invoiceNumber = 'INV-' + String(count + 1).padStart(4, '0');
          const isDeposit = quote.paymentType === 'deposit';
          const depositAmt = isDeposit ? Math.round(quote.totalCents * ((quote.depositPercent || 50) / 100)) : 0;
          const balanceAmt = isDeposit ? quote.totalCents - depositAmt : 0;

          // Calculate balance due date: event date minus tenant's balanceDueDaysBeforeEvent setting
          const balanceDueDays = (contract.tenant as any)?.branding?.balanceDueDaysBeforeEvent ?? 30;
          const eventDate = (contract.event as any)?.eventDate ? new Date((contract.event as any).eventDate) : null;
          const balanceDueDate = eventDate
            ? new Date(eventDate.getTime() - balanceDueDays * 24 * 60 * 60 * 1000)
            : new Date();

          await tx.invoice.create({
            data: {
              tenantId: contract.tenantId,
              eventId: contract.eventId,
              clientId: contract.clientId,
              invoiceNumber,
              subtotalCents: quote.subtotalCents,
              taxAmountCents: quote.taxAmountCents,
              discountCents: quote.discountCents,
              totalCents: quote.totalCents,
              ...sentInvoiceFields(quote.totalCents), // a $0 invoice starts paid
              lineItems: {
                create: (quote.lineItems as any[]).map((li, i) => ({
                  description: li.description,
                  quantity: li.quantity,
                  unitCents: li.unitCents,
                  totalCents: li.totalCents,
                  sortOrder: i,
                })),
              },
              ...(isDeposit ? {
                PaymentMilestone: { create: [
                  { tenantId: contract.tenantId, label: 'Deposit (' + (quote.depositPercent || 50) + '%)', amountCents: depositAmt, dueDate: new Date(), ...milestoneStatusFor(depositAmt) },
                  { tenantId: contract.tenantId, label: 'Balance', amountCents: balanceAmt, dueDate: balanceDueDate, ...milestoneStatusFor(balanceAmt) },
                ]},
              } : {}),
            },
          });
          // A $0 invoice is paid as soon as it exists, which books the event
          if (quote.totalCents <= 0) await bookEvent(tx, contract.eventId);
        }
      }
    }

    return updatedContract;
  });

  // Fire BOOKING_CONFIRMED and CONTRACT_FULLY_EXECUTED automations
  if (contract.eventId) {
    const ev = (contract as any).event;
    triggerAutomation({ tenantId: contract.tenantId, eventId: contract.eventId, trigger: 'BOOKING_CONFIRMED' }).catch(e =>
      console.error('[contract/sign] BOOKING_CONFIRMED automation error:', e)
    );
    triggerAutomation({ tenantId: contract.tenantId, eventId: contract.eventId, trigger: 'CONTRACT_FULLY_EXECUTED' }).catch(e =>
      console.error('[contract/sign] CONTRACT_FULLY_EXECUTED automation error:', e)
    );
    if (ev?.eventDate) {
      scheduleEventDateAutomations({ tenantId: contract.tenantId, eventId: contract.eventId, eventDate: new Date(ev.eventDate) }).catch(() => {});
    }
  }

  // Notify all host admins that the contract was signed
  const hostEmails = (contract.tenant as any)?.memberships?.map((m: any) => m.user.email).filter(Boolean) ?? [];
  if (hostEmails.length > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const companyName = (contract.tenant as any)?.branding?.companyName ?? (contract.tenant as any)?.name ?? '';
    const client = (contract.event as any)?.client;
    const clientName = client ? `${client.firstName} ${client.lastName}` : 'Your client';
    sendHostNotificationEmail({
      to: hostEmails,
      subject: `Contract signed — ${(contract.event as any)?.title ?? 'Event'}`,
      heading: `${clientName} signed the contract`,
      body: `<strong>${clientName}</strong> has signed the contract for <strong>${(contract.event as any)?.title ?? 'an event'}</strong>. An invoice has been automatically created and sent to the client.`,
      ctaLabel: 'View Event',
      ctaUrl: `${appUrl}/events/${contract.eventId}`,
      from: companyName ? `${companyName} via BoothGen <${process.env.EMAIL_FROM ?? 'noreply@boothgen.com'}>` : undefined,
    }).catch(e => console.error('[contract/sign] host notification error:', e));
  }

  return NextResponse.json({ success: true, status: updated.status });
}
