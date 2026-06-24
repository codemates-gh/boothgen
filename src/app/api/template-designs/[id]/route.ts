export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const design = await prisma.templateDesign.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (design.status === 'APPROVED') {
    return NextResponse.json(
      { error: 'Approved designs cannot be deleted — they serve as proof of client approval.' },
      { status: 409 }
    );
  }

  try {
    await deleteFromR2(r2KeyFromUrl(design.fileUrl));
  } catch (err) {
    console.error('[template-design DELETE] R2 delete failed:', err);
  }

  await prisma.templateDesign.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
