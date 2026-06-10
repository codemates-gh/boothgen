import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const t = await prisma.emailTemplate.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: 'asc' } });
  return NextResponse.json(t);
}
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, subject, bodyHtml } = await req.json();
  if (!name || !subject || !bodyHtml) return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  const t = await prisma.emailTemplate.create({ data: { tenantId: session.tenantId, name, subject, bodyHtml } });
  return NextResponse.json(t, { status: 201 });
}
