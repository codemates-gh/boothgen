export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const design = await prisma.templateDesign.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (design.status !== 'PENDING_APPROVAL') return NextResponse.json({ error: 'Design is not awaiting approval' }, { status: 400 });

  await inngest.send({ name: 'template-design/ready-for-review', data: { designId: design.id } });

  return NextResponse.json({ ok: true });
}
