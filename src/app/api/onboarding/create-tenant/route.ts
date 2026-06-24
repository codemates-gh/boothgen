export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { seedTenantEmailDefaults } from '@/lib/tenant/seed-email-defaults';

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36); }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  const slug = slugify(name.trim());
  const tenant = await prisma.tenant.create({
    data: {
      name: name.trim(), slug, status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      branding: { create: { companyName: name.trim(), primaryColor: '#F97316', secondaryColor: '#EA6100' } },
      memberships: { create: { userId: session.userId, role: 'HOST_ADMIN', status: 'ACTIVE', joinedAt: new Date() } },
    },
  });
  // Seed default email templates and automation rules (non-blocking)
  seedTenantEmailDefaults(tenant.id).catch(e => console.error('[seed-email-defaults]', e));

  return NextResponse.json({ success: true, tenantId: tenant.id });
}
