export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

// Returns the BoothGen shared published template library
export async function GET() {
  const templates = await prisma.boothDesignTemplate.findMany({
    where: { tenantId: null, isPublished: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(templates);
}
