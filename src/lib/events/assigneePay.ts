import { prisma } from '@/lib/prisma/client';

// Pay for the person assigned to an event (the Pay field next to Assigned To). It's kept as the event's Operator Pay
// expense (EventExpense with assigneeUserId), so the Profitability card and Bookkeeping (Staff & Attendants, with the
// person as payee) count it like any other event expense.

export async function assigneePayRow(eventId: string) {
  return prisma.eventExpense.findFirst({ where: { eventId, assigneeUserId: { not: null } }, orderBy: { createdAt: 'asc' } });
}

// payCents: a positive amount sets the pay, 0 or null removes it, undefined keeps it. Changing the assignee moves the
// kept pay to the new person; unassigning removes it.
export async function setAssigneePay(tenantId: string, eventId: string, assignee: { id: string; name: string } | null, payCents: number | null | undefined) {
  const row = await assigneePayRow(eventId);
  if (!assignee || payCents === null || payCents === 0) {
    if (row) await prisma.eventExpense.deleteMany({ where: { eventId, assigneeUserId: { not: null } } });
    return null;
  }
  const amountCents = payCents === undefined ? row?.amountCents : Math.round(payCents);
  if (!amountCents) return null;
  const data = { description: `Pay: ${assignee.name.trim() || 'Team member'}`, amountCents, category: 'labor', assigneeUserId: assignee.id };
  return row
    ? prisma.eventExpense.update({ where: { id: row.id }, data })
    : prisma.eventExpense.create({ data: { tenantId, eventId, ...data } });
}
