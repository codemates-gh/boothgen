export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { z } from 'zod';

const Schema = z.object({
  clientToken: z.string().min(1).max(256),
  signatureDataUrl: z.string().min(1),
  signerName: z.string().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { clientToken, signatureDataUrl } = parsed.data;

  const contract = await prisma.contract.findFirst({
    where: { id: params.id, clientToken },
  });
  if (!contract) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  if (contract.status === 'FULLY_EXECUTED') return NextResponse.json({ error: 'Already signed' }, { status: 400 });

  const now = new Date();
  const newStatus = contract.hostSignedAt ? 'FULLY_EXECUTED' : 'CLIENT_SIGNED';

  const updated = await prisma.$transaction(async (tx) => {
    const updatedContract = await tx.contract.update({
      where: { id: params.id },
      data: { clientSignatureData: signatureDataUrl, clientSignedAt: now, clientIpAddress: ip, status: newStatus },
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
                  { tenantId: contract.tenantId, label: 'Balance', amountCents: balanceAmt, dueDate: new Date() },
                ]},
              } : {}),
            },
          });
        }
      }
    }

    return updatedContract;
  });

  return NextResponse.json({ success: true, status: updated.status });
}
