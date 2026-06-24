export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET(req: NextRequest, { params }: { params: { tenantSlug: string } }) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date) return NextResponse.json({ available: true }, { headers: cors() });

  const tenant = await prisma.tenant.findUnique({ where: { slug: params.tenantSlug }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'SUSPENDED') {
    return NextResponse.json({ available: false }, { headers: cors() });
  }

  const blocked = await prisma.blackoutDate.findUnique({
    where: { tenantId_date: { tenantId: tenant.id, date: new Date(date) } },
  });

  return NextResponse.json({ available: !blocked }, { headers: cors() });
}
