export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';

// Only HOST_ADMIN may submit a design for client approval — this triggers a client-facing email.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId: session.tenantId, userId: session.userId as string, status: 'ACTIVE', role: 'HOST_ADMIN' },
  });
  if (!membership) return NextResponse.json({ error: 'Forbidden: HOST_ADMIN role required' }, { status: 403 });

  const design = await prisma.templateDesign.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (design.status === 'APPROVED') return NextResponse.json({ error: 'Design is already approved' }, { status: 400 });
  if (design.status === 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is already pending approval' }, { status: 400 });

  const updated = await prisma.templateDesign.update({
    where: { id: params.id },
    data: { status: 'PENDING_APPROVAL' },
  });

  await inngest.send({ name: 'template-design/ready-for-review', data: { designId: design.id } });

  return NextResponse.json(updated);
}
