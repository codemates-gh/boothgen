export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const templates = await prisma.checklistTemplate.findMany({
    where: { tenantId: session.tenantId },
    include: { items: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, items = [] } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const template = await prisma.checklistTemplate.create({
    data: {
      tenantId: session.tenantId,
      name: name.trim(),
      items: {
        create: (items as string[]).map((label: string, i: number) => ({ label, position: i })),
      },
    },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  return NextResponse.json(template, { status: 201 });
}
