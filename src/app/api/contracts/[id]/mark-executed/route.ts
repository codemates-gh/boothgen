export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { triggerAutomation, scheduleEventDateAutomations } from '@/lib/inngest/trigger';

// Admin bypass: mark a contract fully executed without requiring drawn signatures.
// Used when the contract was signed in person, via DocuSign, or another external tool.
// Mirrors the invoice-creation logic from the client sign route.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contract = await prisma.contract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      event: true,
      tenant: { include: { branding: { select: { companyName: true, balanceDueDaysBeforeEvent: true } } } },
    },
  });

  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already fully executed' }, { status: 400 });
  if (contract.status === 'VOIDED') return NextResponse.json({ error: 'Voided contracts cannot be executed' }, { status: 400 });

  const now = new Date();
  let invoiceCreated = false;

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: params.id },
      data: {
        status: 'FULLY_EXECUTED',
        clientSignedAt: contract.clientSignedAt ?? now,
        hostSignedAt: contract.hostSignedAt ?? now,
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

          const balanceDueDays = (contract.tenant as any)?.branding?.balanceDueDaysBeforeEvent ?? 30;
          const eventDate = contract.event?.eventDate ? new Date(contract.event.eventDate) : null;
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
              balanceDueCents: quote.totalCents,
              amountPaidCents: 0,
              status: 'SENT',
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
                  { tenantId: contract.tenantId, label: 'Deposit (' + (quote.depositPercent || 50) + '%)', amountCents: depositAmt, dueDate: new Date() },
                  { tenantId: contract.tenantId, label: 'Balance', amountCents: balanceAmt, dueDate: balanceDueDate },
                ]},
              } : {}),
            },
          });
          invoiceCreated = true;
        }
      }
    }
  });

  if (contract.eventId) {
    triggerAutomation({ tenantId: contract.tenantId, eventId: contract.eventId, trigger: 'BOOKING_CONFIRMED' }).catch(() => {});
    triggerAutomation({ tenantId: contract.tenantId, eventId: contract.eventId, trigger: 'CONTRACT_EXECUTED' }).catch(() => {});
    if (contract.event?.eventDate) {
      scheduleEventDateAutomations({ tenantId: contract.tenantId, eventId: contract.eventId, eventDate: new Date(contract.event.eventDate) }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, invoiceCreated });
}
