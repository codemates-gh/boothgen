import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma/client';
import { GET } from '@/app/api/calendar/feed/[token]/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Calendar subscription feed', () => {
  it('serves a valid calendar: lines folded at 75 bytes without breaking emoji, and real line breaks in descriptions', async () => {
    const { tenant, client } = await seedTenant();
    const token = randomUUID();
    await prisma.tenant.update({ where: { id: tenant.id }, data: { calendarToken: token } });
    const event = await seedEvent(tenant.id, client.id);
    // A long title so the summary (and the design-deadline entry with its emoji) has to be folded
    await prisma.event.update({ where: { id: event.id }, data: { title: 'Wedding reception with a very long name ' + 'é🎉'.repeat(20) } });

    const res = await GET(req('/x'), { params: { token } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/calendar/);
    const body = await res.text();
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(body).not.toContain('�');
    for (const line of body.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    // Unfolded, the summary is intact
    const unfolded = body.replace(/\r\n /g, '');
    expect(unfolded).toContain('Wedding reception with a very long name ' + 'é🎉'.repeat(20));
    expect(unfolded).toMatch(/DESCRIPTION:Client: [^\r]*\\nVenue: The Glasshouse\\nStatus: BOOKED/);
    expect(unfolded).not.toContain('\\\\n');

    expect((await GET(req('/x'), { params: { token: 'nope' } })).status).toBe(404);
  });
});
