export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { findAdminEvent, isLocked, lockedError, templateView } from '@/lib/genie/eventAdmin';
import { findLibraryTemplate } from '@/lib/genie/library';
import { StoredLayout } from '@/lib/genie/schemas';

async function load(tenantId: string, eventId: string, templateId: string) {
  const event = await findAdminEvent(tenantId, eventId);
  if (!event) return null;
  const template = await prisma.eventGenieTemplate.findFirst({ where: { id: templateId, eventId: event.id, tenantId } });
  return template ? { event, template } : null;
}

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  // true: copy the library template's other-orientation layout; false: remove it
  alternate: z.boolean().optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: { id: string; templateId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const found = await load(auth.tenantId, params.id, params.templateId);
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isLocked(found.event)) return lockedError();

  const data: Prisma.EventGenieTemplateUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.alternate === false) data.alternateLayout = Prisma.DbNull;
  if (parsed.data.alternate === true) {
    const lib = found.template.libraryTemplateId ? await findLibraryTemplate(auth.tenantId, found.template.libraryTemplateId) : null;
    const alt = lib?.alternateLayout ? StoredLayout.safeParse(lib.alternateLayout) : null;
    if (!alt?.success) return NextResponse.json({ error: "This template doesn't have an alternate orientation." }, { status: 422 });
    data.alternateLayout = alt.data;
  }
  // Layout changes reach iPads through the bundle hash; the version tells them the artwork changed
  if (data.alternateLayout !== undefined) data.version = { increment: 1 };
  const saved = await prisma.eventGenieTemplate.update({ where: { id: found.template.id }, data });
  return NextResponse.json(templateView(saved));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; templateId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const found = await load(auth.tenantId, params.id, params.templateId);
  if (!found) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isLocked(found.event)) return lockedError();
  await prisma.eventGenieTemplate.delete({ where: { id: found.template.id } });
  return NextResponse.json({ ok: true });
}
