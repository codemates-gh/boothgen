export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { designBriefEnabled, customDesignEnabled } = await req.json();
  const branding = await prisma.tenantBranding.upsert({
    where: { tenantId: session.tenantId },
    create: { tenantId: session.tenantId, designBriefEnabled: designBriefEnabled ?? false, customDesignEnabled: customDesignEnabled ?? false },
    update: {
      ...(designBriefEnabled !== undefined && { designBriefEnabled }),
      ...(customDesignEnabled !== undefined && { customDesignEnabled }),
    },
  });
  return NextResponse.json({ designBriefEnabled: branding.designBriefEnabled, customDesignEnabled: branding.customDesignEnabled });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId } });
  return NextResponse.json({
    designBriefEnabled: branding?.designBriefEnabled ?? false,
    customDesignEnabled: branding?.customDesignEnabled ?? false,
  });
}
