export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';
import { z } from 'zod';

const Schema = z.object({
  portalToken: z.string().min(1),
  revisionNote: z.string().min(1, 'Revision note is required'),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });

  const { portalToken, revisionNote } = parsed.data;

  const design = await prisma.templateDesign.findUnique({
    where: { id: params.id },
    include: { event: { select: { portalToken: true } } },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (design.event.portalToken !== portalToken) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  if (design.status === 'APPROVED') return NextResponse.json({ error: 'Design is already approved and cannot be changed' }, { status: 400 });
  if (design.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is not pending approval' }, { status: 400 });

  const updated = await prisma.templateDesign.update({
    where: { id: params.id },
    data: { status: 'REVISION_REQUESTED', revisionNote },
  });

  await inngest.send({ name: 'template-design/decision', data: { designId: design.id, decision: 'revision_requested' } });

  return NextResponse.json({ success: true, status: updated.status });
}
