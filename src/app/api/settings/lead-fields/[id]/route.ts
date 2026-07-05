export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const field = await prisma.customLeadField.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!field) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.customLeadField.update({
    where: { id: params.id },
    data: {
      ...(body.label !== undefined && { label: body.label.trim() }),
      ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
      ...(body.required !== undefined && { required: body.required }),
      ...(body.options !== undefined && { options: body.options }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const field = await prisma.customLeadField.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!field) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.customLeadField.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
