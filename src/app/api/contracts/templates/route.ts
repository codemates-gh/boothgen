export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const templates = await prisma.contractTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, bodyHtml } = await req.json();
  if (!name || !bodyHtml) return NextResponse.json({ error: 'Name and body required' }, { status: 400 });
  const count = await prisma.contractTemplate.count({ where: { tenantId: session.tenantId } });
  const template = await prisma.contractTemplate.create({ data: { tenantId: session.tenantId, name, bodyHtml, isDefault: count === 0 } });
  return NextResponse.json(template, { status: 201 });
}
