import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/inngest/trigger', () => ({ triggerAutomation: vi.fn(async () => {}), scheduleEventDateAutomations: vi.fn(async () => {}) }));
vi.mock('@/lib/email/send', () => ({ sendHostNotificationEmail: vi.fn(async () => {}) }));

import { prisma } from '@/lib/prisma/client';
import { POST as SIGN } from '@/app/api/contracts/[id]/sign/client/route';
import { GET as PORTAL_PDF } from '@/app/api/portal/[portalToken]/pdf/[doc]/route';
import { parseMergeTags } from '@/lib/contracts/merge-tags';
import { initialBoxesHtml, initialLabels, initialsFromName } from '@/lib/contracts/initials';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

// "Initial Here" boxes: the client initials key sections before they can sign
const BODY = '<h3>Payment</h3><p>Pay the balance 30 days before. <span class="merge-tag" data-tag="{{initial:Payment terms}}">{{initial:Payment terms}}</span></p>'
  + '<h3>Cancellation</h3><p>Deposits are non-refundable. {{initial:Cancellation &amp; refunds}}</p><p>Hi {{client.first_name}}</p>';

async function setup(content = BODY) {
  const { tenant, client } = await seedTenant({ messaging: false });
  const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
  const contract = await prisma.contract.create({ data: {
    tenantId: tenant.id, clientId: client.id, eventId: event.id, title: 'Booking Agreement', status: 'SENT_TO_CLIENT',
    templateContent: content, renderedContent: content.replace('{{client.first_name}}', 'Ana'),
  } });
  return { event, contract };
}

const sign = (id: string, body: Record<string, unknown>) =>
  SIGN(req('/x', { body, headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'TestBrowser/1.0' } }), { params: Promise.resolve({ id }) });

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Initial Here boxes', () => {
  it('keeps markers through merge tags and finds their labels in order', () => {
    const html = parseMergeTags(BODY, { client: { first_name: 'Ana' } } as any);
    expect(html).toContain('{{initial:Payment terms}}');
    expect(html).toContain('Hi Ana');
    expect(initialLabels(html)).toEqual(['Payment terms', 'Cancellation & refunds']);
    expect(initialsFromName('  ana  maría rivera ')).toBe('AMR');
    const boxes = initialBoxesHtml('<p>{{initial:<b>x</b>"y}}</p>', ['A"B']);
    expect(boxes).toContain('A&quot;B');
    expect(boxes).not.toContain('<b>');
  });

  it('won\'t sign until every box is initialed, then records each one', async () => {
    const { contract } = await setup();
    const base = { clientToken: contract.clientToken, signatureDataUrl: 'Ana Rivera', signerName: 'Ana Rivera' };

    for (const initials of [undefined, [{ initials: 'AR' }], [{ initials: 'AR' }, { initials: ' ' }]]) {
      const r = await sign(contract.id, { ...base, initials });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/initial every/);
    }
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).clientSignedAt).toBeNull();

    const tapped = new Date(Date.now() - 60_000).toISOString();
    const r = await sign(contract.id, { ...base, initials: [{ initials: 'AR', initialedAt: tapped }, { initials: 'AR', initialedAt: '2001-01-01T00:00:00Z' }] });
    expect(r.status).toBe(200);
    const saved = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(saved.status).toBe('CLIENT_SIGNED');
    expect(saved.clientUserAgent).toBe('TestBrowser/1.0');
    const rec = saved.clientInitials as any[];
    expect(rec.map(i => [i.label, i.initials, i.ipAddress])).toEqual([['Payment terms', 'AR', '203.0.113.9'], ['Cancellation & refunds', 'AR', '203.0.113.9']]);
    expect(rec[0].initialedAt).toBe(tapped);
    // A tap time that makes no sense is replaced by the signing time
    expect(rec[1].initialedAt).toBe(saved.clientSignedAt!.toISOString());
  });

  it('leaves contracts without boxes as they were', async () => {
    const { contract } = await setup('<p>Plain terms</p>');
    const r = await sign(contract.id, { clientToken: contract.clientToken, signatureDataUrl: 'Ana', signerName: 'Ana' });
    expect(r.status).toBe(200);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).clientInitials).toBeNull();
  });

  it('prints the initials in the contract PDF', async () => {
    const { event, contract } = await setup();
    await sign(contract.id, { clientToken: contract.clientToken, signatureDataUrl: 'Ana Rivera', signerName: 'Ana Rivera',
      initials: [{ initials: 'AR' }, { initials: 'AR' }] });
    const res = await PORTAL_PDF(req('/x'), { params: Promise.resolve({ portalToken: event.portalToken!, doc: 'contract' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});
