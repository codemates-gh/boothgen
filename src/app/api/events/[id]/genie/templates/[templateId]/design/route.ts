export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { findAdminEvent, isLocked, lockedError, templateView } from '@/lib/genie/eventAdmin';
import { applyArtwork, latestApprovedDesign, loadDesignArtwork } from '@/lib/genie/approvedDesign';
import type { StoredLayout } from '@/lib/genie/schemas';

const Body = z.object({ mode: z.enum(['background', 'overlay']).optional() }).strict();

// Uses the client-approved design as this event template's artwork (frames stay as designed)
export async function POST(req: NextRequest, { params }: { params: { id: string; templateId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const template = await prisma.eventGenieTemplate.findFirst({ where: { id: params.templateId, eventId: event.id, tenantId: auth.tenantId } });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (isLocked(event)) return lockedError();

  const design = await latestApprovedDesign(auth.tenantId, event.id);
  if (!design) return NextResponse.json({ error: "The client hasn't approved a design for this event yet.", code: 'no_approved_design' }, { status: 409 });
  const art = await loadDesignArtwork(auth.tenantId, design.fileUrl);
  if ('error' in art) return NextResponse.json({ error: art.error }, { status: 422 });
  const applied = applyArtwork({ layout: template.layout as unknown as StoredLayout, alternateLayout: template.alternateLayout as unknown as StoredLayout | null }, art, parsed.data.mode);
  if ('error' in applied) return NextResponse.json({ error: applied.error }, { status: 422 });

  const saved = await prisma.eventGenieTemplate.update({
    where: { id: template.id },
    // Thumbnail no longer shows the right artwork
    data: { [applied.which]: applied.updated, designId: design.id, thumbnail: Prisma.DbNull, version: { increment: 1 } },
  });
  return NextResponse.json({ ...templateView(saved), appliedAs: applied.as, warning: applied.warning });
}
