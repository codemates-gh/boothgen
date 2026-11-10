export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { findAdminEvent, isLocked, lockedError, templateView } from '@/lib/genie/eventAdmin';
import { findLibraryTemplate } from '@/lib/genie/library';
import { StoredLayout } from '@/lib/genie/schemas';

const Add = z.object({ libraryTemplateId: z.string().min(1), alternate: z.boolean().optional() }).strict();

// Copies a library template into the event (added last in the guest picker)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Add.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!event.genieSettings) return NextResponse.json({ error: 'Set up Genie for this event first', code: 'not_configured' }, { status: 409 });
  if (isLocked(event)) return lockedError();

  const lib = await findLibraryTemplate(auth.tenantId, parsed.data.libraryTemplateId);
  if (!lib) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  const layout = StoredLayout.safeParse(lib.layout);
  if (!layout.success) return NextResponse.json({ error: "This template's layout is incomplete. Open it in the designer and save it again." }, { status: 422 });
  const alternate = parsed.data.alternate && lib.alternateLayout ? StoredLayout.safeParse(lib.alternateLayout) : null;
  if (alternate && !alternate.success) return NextResponse.json({ error: "This template's alternate layout is incomplete." }, { status: 422 });

  const last = await prisma.eventGenieTemplate.findFirst({ where: { eventId: event.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const t = await prisma.eventGenieTemplate.create({
    data: {
      tenantId: auth.tenantId, eventId: event.id, name: lib.name.slice(0, 80), sortOrder: (last?.sortOrder ?? -1) + 1,
      layout: layout.data, ...(alternate?.success ? { alternateLayout: alternate.data } : {}), libraryTemplateId: lib.id,
    },
  });
  return NextResponse.json(templateView(t), { status: 201 });
}

const Reorder = z.object({ order: z.array(z.string().min(1)).min(1) }).strict();

// Sets the guest picker order; `order` must list every template on the event exactly once
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Reorder.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isLocked(event)) return lockedError();

  const current = await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id, tenantId: auth.tenantId }, select: { id: true } });
  const ids = new Set(current.map(t => t.id));
  const order = parsed.data.order;
  if (order.length !== ids.size || new Set(order).size !== order.length || order.some(id => !ids.has(id))) {
    return NextResponse.json({ error: "The order doesn't match the event's templates. Reload and try again." }, { status: 409 });
  }
  await prisma.$transaction(order.map((id, i) => prisma.eventGenieTemplate.update({ where: { id }, data: { sortOrder: i } })));
  const saved = await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  return NextResponse.json(saved.map(templateView));
}
