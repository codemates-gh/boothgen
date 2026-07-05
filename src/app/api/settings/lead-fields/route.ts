export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const fields = await prisma.customLeadField.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(fields);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { label, fieldType, required, options } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  const count = await prisma.customLeadField.count({ where: { tenantId: session.tenantId } });
  const field = await prisma.customLeadField.create({
    data: {
      tenantId: session.tenantId,
      label: label.trim(),
      fieldType: fieldType ?? 'TEXT',
      required: required ?? false,
      options: options ?? null,
      sortOrder: count,
    },
  });
  return NextResponse.json(field, { status: 201 });
}
