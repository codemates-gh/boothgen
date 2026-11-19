import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const sendEventAssignmentEmail = vi.fn(async (..._a: unknown[]) => ({ success: true }));
vi.mock('@/lib/email/send', async orig => ({ ...(await orig<typeof import('@/lib/email/send')>()), sendEventAssignmentEmail: (...a: unknown[]) => sendEventAssignmentEmail(...a) }));
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { retrieve: vi.fn(async () => ({})) } } }));

import { prisma } from '@/lib/prisma/client';
import { PATCH as ASSIGN } from '@/app/api/events/[id]/assign/route';
import { syncLedger } from '@/lib/bookkeeping/sync';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const TAG = '@assignee-pay.boothgen.test';
const assign = (id: string, body: unknown) => ASSIGN(req('/x', { method: 'PATCH', body }), { params: Promise.resolve({ id }) });
const payRows = (eventId: string) => prisma.eventExpense.findMany({ where: { eventId } });

async function setup() {
  const { tenant, client } = await seedTenant();
  session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'admin' };
  const member = async (name: string) => {
    const u = await prisma.user.create({ data: { email: randomUUID() + TAG, name } });
    await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: u.id, role: 'TEAM_MEMBER', status: 'ACTIVE' } });
    return u;
  };
  const event = await seedEvent(tenant.id, client.id);
  return { tenant, event, ana: await member('Ana Contractor'), ben: await member('Ben Attendant') };
}

beforeEach(async () => { await resetDb(); await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } }); sendEventAssignmentEmail.mockClear(); });
afterAll(async () => { await resetDb(); await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } }); await prisma.$disconnect(); });

describe('Pay for the assigned person', () => {
  it('saves the pay as the event’s Operator Pay, follows the assignee, and is removed when cleared or unassigned', async () => {
    const { event, ana, ben } = await setup();
    const r = await assign(event.id, { userId: ana.id, payCents: 45000 });
    expect(r.status).toBe(200);
    expect((await r.json()).payCents).toBe(45000);
    expect((await payRows(event.id)).map(e => [e.description, e.amountCents, e.category, e.assigneeUserId])).toEqual([['Pay: Ana Contractor', 45000, 'labor', ana.id]]);
    expect(sendEventAssignmentEmail).toHaveBeenCalledTimes(1);

    // Changing only the pay updates the one row and doesn't email the person again
    await assign(event.id, { userId: ana.id, payCents: 50000 });
    expect((await payRows(event.id)).map(e => e.amountCents)).toEqual([50000]);
    expect(sendEventAssignmentEmail).toHaveBeenCalledTimes(1);

    // Another assignee: the pay moves to them
    await assign(event.id, { userId: ben.id });
    expect((await payRows(event.id)).map(e => [e.description, e.amountCents, e.assigneeUserId])).toEqual([['Pay: Ben Attendant', 50000, ben.id]]);

    // Other expenses on the event stay put
    await prisma.eventExpense.create({ data: { tenantId: event.tenantId, eventId: event.id, description: 'Props', amountCents: 2000, category: 'supplies' } });
    await assign(event.id, { userId: ben.id, payCents: null });
    expect((await payRows(event.id)).map(e => e.description)).toEqual(['Props']);
    await assign(event.id, { userId: ben.id, payCents: 30000 });
    await assign(event.id, { userId: null });
    expect((await payRows(event.id)).map(e => e.description)).toEqual(['Props']);
    expect((await assign(event.id, { userId: ana.id, payCents: -5 })).status).toBe(400);
  });

  it('shows in Bookkeeping as Staff & Attendants with the person as payee', async () => {
    const { tenant, event, ana } = await setup();
    await assign(event.id, { userId: ana.id, payCents: 45000 });
    await syncLedger(tenant.id);
    const rows = await prisma.ledgerTransaction.findMany({ where: { tenantId: tenant.id, eventId: event.id, type: 'EXPENSE' }, include: { category: true } });
    expect(rows.map(r => [r.amountCents, r.payee, r.category?.name])).toEqual([[45000, 'Ana Contractor', 'Staff & Attendants']]);
  });

  it('only admins can set it', async () => {
    const { event, ana } = await setup();
    session = { ...session, tenantRole: 'TEAM_MEMBER' };
    expect((await assign(event.id, { userId: ana.id, payCents: 100 })).status).toBe(403);
  });
});
