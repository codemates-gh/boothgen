export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.boothDesignTemplate.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.format !== undefined ? { format: body.format } : {}),
      ...(body.orientation !== undefined ? { orientation: body.orientation } : {}),
      ...(body.photoCount !== undefined ? { photoCount: body.photoCount } : {}),
      ...(body.textZones !== undefined ? { textZones: body.textZones } : {}),
      ...(body.colorSlots !== undefined ? { colorSlots: body.colorSlots } : {}),
      ...(body.fontOptions !== undefined ? { fontOptions: body.fontOptions } : {}),
      ...(body.previewImageUrl !== undefined ? { previewImageUrl: body.previewImageUrl || null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const t = await prisma.boothDesignTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.boothDesignTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
