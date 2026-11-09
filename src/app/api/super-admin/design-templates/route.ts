export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma/client';

function isSuperAdmin() {
  const c = cookies();
  return c.get('sa_session')?.value === process.env.SUPER_ADMIN_SECRET;
}

export async function GET() {
  if (!isSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const templates = await prisma.boothDesignTemplate.findMany({
    where: { tenantId: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, description, format, orientation, photoCount, thumbnailUrl, textZones, colorVariants, fontPairings } = await req.json();
  if (!name?.trim() || !format || !orientation) {
    return NextResponse.json({ error: 'Name, format, and orientation are required.' }, { status: 400 });
  }
  const template = await prisma.boothDesignTemplate.create({
    data: {
      tenantId: null,
      name: name.trim(),
      description: description?.trim() || null,
      format,
      orientation,
      photoCount: Number(photoCount) || 3,
      thumbnailUrl: thumbnailUrl || null,
      textZones: textZones ?? [],
      colorVariants: colorVariants ?? [],
      fontPairings: fontPairings ?? [],
      isPublished: false,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
