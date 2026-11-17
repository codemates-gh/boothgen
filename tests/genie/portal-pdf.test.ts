import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma/client';
import { GET } from '@/app/api/portal/[portalToken]/pdf/[doc]/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

// Client portal "Download PDF" for quote, invoice and contract (report #9)
const get = (portalToken: string, doc: string) => GET(req('/x'), { params: Promise.resolve({ portalToken, doc }) });

async function setup() {
  const { tenant, client } = await seedTenant({ messaging: false });
  const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
  return { tenant, client, event };
}

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('portal PDF download', () => {
  it('downloads the event\'s latest quote, invoice and contract as PDFs', async () => {
    const { tenant, client, event } = await setup();
    const base = { tenantId: tenant.id, clientId: client.id, eventId: event.id };
    await prisma.quote.create({ data: { ...base, quoteNumber: 'Q-0001', status: 'SENT', createdAt: new Date('2026-01-01') } });
    await prisma.quote.create({ data: { ...base, quoteNumber: 'Q-0002', status: 'SENT', totalCents: 50000,
      lineItems: { create: [{ description: '2 Hours Photo Booth\n* Prints\n* Props', quantity: 1, unitCents: 50000, totalCents: 50000 }] } } });
    await prisma.invoice.create({ data: { ...base, invoiceNumber: 'INV-0007', status: 'SENT', totalCents: 50000, balanceDueCents: 50000 } });
    await prisma.contract.create({ data: { ...base, title: 'Booking Agreement', status: 'SENT_TO_CLIENT', templateContent: '<p>Hi</p>', renderedContent: '<p>Hi Ana</p>' } });

    for (const [doc, name] of [['quote', 'Q-0002.pdf'], ['invoice', 'INV-0007.pdf'], ['contract', 'contract-']] as const) {
      const res = await get(event.portalToken, doc);
      expect(res.status, doc).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('attachment; filename="' + name);
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('returns 404 for a wrong portal link, an unknown document or nothing to download', async () => {
    const { event } = await setup();
    expect((await get('not-a-token', 'quote')).status).toBe(404);
    expect((await get(event.portalToken, 'gallery')).status).toBe(404);
    for (const doc of ['quote', 'invoice', 'contract']) expect((await get(event.portalToken, doc)).status, doc).toBe(404);
  });

  it('never returns another event\'s documents', async () => {
    const a = await setup();
    const b = await seedEvent(a.tenant.id, a.client.id, { settings: false, templates: 0 });
    await prisma.quote.create({ data: { tenantId: a.tenant.id, clientId: a.client.id, eventId: b.id, quoteNumber: 'Q-OTHER', status: 'SENT' } });
    expect((await get(a.event.portalToken, 'quote')).status).toBe(404);
    expect((await get(b.portalToken, 'quote')).status).toBe(200);
  });
});
