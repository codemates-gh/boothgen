import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let session: { tenantId?: string; tenantRole?: string; globalRole: string } = { globalRole: 'USER' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', ...session })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({})) }));

import { prisma } from '@/lib/prisma/client';
import { DesignLayout } from '@/lib/genie/designer';
import { GET as LIBRARY, POST as CREATE } from '@/app/api/genie-templates/route';
import { GET as GET_T, PUT as UPDATE, PATCH as TOGGLE, DELETE as REMOVE } from '@/app/api/genie-templates/[templateId]/route';
import { GET as PORTAL_BRIEF, POST as PORTAL_SUBMIT } from '@/app/api/portal/[portalToken]/design-brief/route';
import { POST as HIDE } from '@/app/api/template-library/hidden/route';
import { GET as BOOTH_TEMPLATES } from '@/app/api/settings/booth-templates/route';
import { STANDARD_TEMPLATES, standardTemplatesSql } from '../../scripts/standard-templates.mjs';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const SAMPLE_LAYOUT = STANDARD_TEMPLATES.find((t: { id: string }) => t.id === 'std_s_three')!.layout;

const PREFIX = 'TL test ';
const json = (body: unknown, method = 'POST') => req('/x', { method, body });
const p = (templateId: string) => ({ params: { templateId } });
const asSuperAdmin = (tenantId?: string) => { session = tenantId ? { tenantId, tenantRole: 'HOST_ADMIN', globalRole: 'SUPER_ADMIN' } : { globalRole: 'SUPER_ADMIN' }; };
const asOperator = (tenantId: string) => { session = { tenantId, tenantRole: 'HOST_ADMIN', globalRole: 'USER' }; };

const OPTIONS = {
  description: 'Two photos side by side',
  textZones: [{ id: 'names', label: 'Names', placeholder: 'Ana & Ben', maxChars: 40, required: true }],
  colorVariants: [{ id: 'gold', name: 'Gold', colors: { background: '#FFFFFF', text: '#000000', accent: '#D4AF37' } }],
  fontPairings: [{ id: 'el', name: 'Elegant', fonts: [{ zoneId: 'names', fontId: 'great-vibes', label: 'Names', fontFamily: "'Great Vibes', cursive" }] }],
};

async function cleanStandard() {
  await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: PREFIX } } });
}
beforeEach(async () => { await resetDb(); await cleanStandard(); });
afterAll(async () => { await resetDb(); await cleanStandard(); await prisma.$disconnect(); });

describe('Standard layout set', () => {
  it('every layout passes the designer rules and the SQL covers them all', () => {
    expect(STANDARD_TEMPLATES).toHaveLength(15);
    for (const t of STANDARD_TEMPLATES) {
      const r = DesignLayout.safeParse(t.layout);
      expect(r.success, `${t.name}: ${r.success ? '' : r.error.issues[0]?.message}`).toBe(true);
      expect(new Set(t.layout.slots.map((s: { shotIndex: number }) => s.shotIndex)).size).toBe(t.photoCount);
    }
    const sql = standardTemplatesSql();
    for (const t of STANDARD_TEMPLATES) expect(sql).toContain(`'${t.id}'`);
    expect(sql).not.toMatch(/\bDROP\b|DELETE FROM|TRUNCATE/);
  });
});

describe('Super Admin → Design Templates', () => {
  it('a super admin outside any account designs Standard templates with client options', async () => {
    asSuperAdmin();
    const r = await CREATE(json({ name: PREFIX + 'Duo', scope: 'standard', isPublished: true, layout: SAMPLE_LAYOUT, ...OPTIONS }));
    expect(r.status).toBe(201);
    const t = await r.json();
    expect(t).toMatchObject({ scope: 'standard', isPublished: true, description: 'Two photos side by side' });
    expect(t.textZones).toHaveLength(1);

    // Can't make "my" templates without an account
    expect((await CREATE(json({ name: PREFIX + 'Mine', layout: SAMPLE_LAYOUT }))).status).toBe(400);

    // Font pairings follow the text fields; removing a field drops its font
    const u = await UPDATE(json({ name: PREFIX + 'Duo', layout: SAMPLE_LAYOUT, ...OPTIONS, textZones: [] }, 'PUT'), p(t.id));
    expect(u.status).toBe(200);
    expect((await u.json()).fontPairings[0].fonts).toEqual([]);

    // Validation
    expect((await UPDATE(json({ name: PREFIX + 'Duo', layout: SAMPLE_LAYOUT, colorVariants: [{ id: 'x', name: 'X', colors: { background: 'red', text: '#000000', accent: '#000000' } }] }, 'PUT'), p(t.id))).status).toBe(400);

    expect((await LIBRARY()).status).toBe(200);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), p(t.id))).status).toBe(200);
  });

  it("operators can't create or change Standard templates", async () => {
    const { tenant } = await seedTenant();
    asSuperAdmin();
    const t = await (await CREATE(json({ name: PREFIX + 'Std', scope: 'standard', isPublished: true, layout: SAMPLE_LAYOUT }))).json();
    asOperator(tenant.id);
    expect((await CREATE(json({ name: PREFIX + 'Nope', scope: 'standard', layout: SAMPLE_LAYOUT }))).status).toBe(403);
    expect((await UPDATE(json({ name: PREFIX + 'Hack', layout: SAMPLE_LAYOUT }, 'PUT'), p(t.id))).status).toBe(403);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), p(t.id))).status).toBe(403);
    expect((await (await GET_T(req('/x'), p(t.id))).json()).canEdit).toBe(false);
    expect((await TOGGLE(json({ visible: false }, 'PATCH'), p(t.id))).status).toBe(403);

    // Operators switch their own templates' "offer to clients"; super admins publish Standard ones
    const mine = await (await CREATE(json({ name: PREFIX + 'Mine', layout: SAMPLE_LAYOUT }))).json();
    expect((await (await TOGGLE(json({ visible: true }, 'PATCH'), p(mine.id))).json()).offerToClients).toBe(true);
    asSuperAdmin();
    expect((await (await TOGGLE(json({ visible: false }, 'PATCH'), p(t.id))).json()).isPublished).toBe(false);
    expect((await TOGGLE(json({ visible: 'yes' }, 'PATCH'), p(t.id))).status).toBe(400);
  });
});

describe('Client design picker', () => {
  it('shows published Standard layouts the operator keeps plus their own offered templates', async () => {
    const { tenant, client } = await seedTenant();
    const other = await seedTenant();
    await prisma.tenantBranding.create({ data: { tenantId: tenant.id, designBriefEnabled: true } });
    const event = await seedEvent(tenant.id, client.id);
    const { portalToken } = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { portalToken: true } });

    asSuperAdmin();
    const kept = await (await CREATE(json({ name: PREFIX + 'Kept', scope: 'standard', isPublished: true, layout: SAMPLE_LAYOUT }))).json();
    const hidden = await (await CREATE(json({ name: PREFIX + 'Hidden', scope: 'standard', isPublished: true, layout: SAMPLE_LAYOUT }))).json();
    const draft = await (await CREATE(json({ name: PREFIX + 'Draft', scope: 'standard', isPublished: false, layout: SAMPLE_LAYOUT }))).json();
    await prisma.tenant.update({ where: { id: tenant.id }, data: { hiddenStandardTemplates: [hidden.id] } });

    asOperator(tenant.id);
    const offered = await (await CREATE(json({ name: PREFIX + 'Offered', layout: SAMPLE_LAYOUT, offerToClients: true, ...OPTIONS }))).json();
    const notOffered = await (await CREATE(json({ name: PREFIX + 'Private', layout: SAMPLE_LAYOUT }))).json();
    asOperator(other.tenant.id);
    const theirs = await (await CREATE(json({ name: PREFIX + 'Theirs', layout: SAMPLE_LAYOUT, offerToClients: true }))).json();

    const d = await (await PORTAL_BRIEF(req('/x'), { params: { portalToken } })).json();
    const ids = d.templates.map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining([kept.id, offered.id]));
    for (const id of [hidden.id, draft.id, notOffered.id, theirs.id]) expect(ids).not.toContain(id);
    expect(ids.indexOf(offered.id)).toBeLessThan(ids.indexOf(kept.id)); // the operator's own first
    const o = d.templates.find((t: { id: string }) => t.id === offered.id);
    expect(o).toMatchObject({ photoCount: 3, scope: 'mine', layout: { widthPx: 600 } });

    // Only an offered layout can be submitted
    const submit = (templateId: string) => PORTAL_SUBMIT(json({ templateId, textValues: { names: 'Ana & Ben' } }), { params: { portalToken } });
    expect((await submit(theirs.id)).status).toBe(400);
    expect((await submit(hidden.id)).status).toBe(400);
    expect((await submit(offered.id)).status).toBe(200);
  });

  it('operators hide Standard layouts they do not offer, and can show them again', async () => {
    const { tenant, client } = await seedTenant();
    await prisma.tenantBranding.create({ data: { tenantId: tenant.id, designBriefEnabled: true } });
    const event = await seedEvent(tenant.id, client.id);
    const { portalToken } = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { portalToken: true } });
    asSuperAdmin();
    const std = await (await CREATE(json({ name: PREFIX + 'Std', scope: 'standard', isPublished: true, layout: SAMPLE_LAYOUT }))).json();
    const draft = await (await CREATE(json({ name: PREFIX + 'Draft', scope: 'standard', isPublished: false, layout: SAMPLE_LAYOUT }))).json();

    asOperator(tenant.id);
    const portalIds = async () => (await (await PORTAL_BRIEF(req('/x'), { params: { portalToken } })).json()).templates.map((t: { id: string }) => t.id);
    expect(await portalIds()).toContain(std.id);

    expect((await HIDE(json({ templateId: std.id, hidden: true }))).status).toBe(200);
    expect(await portalIds()).not.toContain(std.id);
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.find((t: { id: string }) => t.id === std.id).hidden).toBe(true); // still listed, flagged
    const settings = await (await BOOTH_TEMPLATES()).json();
    expect(settings.find((t: { id: string }) => t.id === std.id).hidden).toBe(true);

    expect((await HIDE(json({ templateId: std.id, hidden: false }))).status).toBe(200);
    expect(await portalIds()).toContain(std.id);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).hiddenStandardTemplates).toEqual([]);

    // Only published Standard layouts can be hidden; another account isn't affected
    expect((await HIDE(json({ templateId: draft.id, hidden: true }))).status).toBe(404);
    expect((await HIDE(json({ templateId: std.id }))).status).toBe(400);
    const other = await seedTenant();
    await HIDE(json({ templateId: std.id, hidden: true }));
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: other.tenant.id } })).hiddenStandardTemplates).toEqual([]);
  });
});

void randomUUID;
