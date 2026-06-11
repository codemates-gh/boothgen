export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, subject, bodyHtml } = await req.json();
  const t = await prisma.emailTemplate.update({ where: { id: params.id }, data: { name, subject, bodyHtml } });
  return NextResponse.json(t);
}
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.emailTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
