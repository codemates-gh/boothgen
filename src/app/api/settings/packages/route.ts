export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const pkgs = await prisma.servicePackage.findMany({ where: { tenantId: session.tenantId }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  return NextResponse.json(pkgs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { name, description, priceCents, category } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const pkg = await prisma.servicePackage.create({ data: { tenantId: session.tenantId, name, description: description || null, priceCents: priceCents || 0, category: category || 'package' } });
  return NextResponse.json(pkg, { status: 201 });
}
