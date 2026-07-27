export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { seedTenantEmailDefaults } from '@/lib/tenant/seed-email-defaults';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

export async function POST(req: NextRequest) {
  const { token, firstName, lastName, email, company, password } = await req.json();

  if (!token || !firstName?.trim() || !lastName?.trim() || !email?.trim() || !company?.trim() || !password) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const member = await prisma.foundingMember.findUnique({
    where: { setupToken: token },
    select: { id: true, status: true, tier: true },
  });

  if (!member) {
    return NextResponse.json({ error: 'Invalid or expired setup link.' }, { status: 400 });
  }
  if (member.status !== 'PAID') {
    return NextResponse.json({ error: 'This setup link has already been used or is not valid.' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return NextResponse.json({ error: 'An account with that email already exists. Please use a different email or sign in.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = slugify(company.trim());
  const fullName = `${firstName.trim()} ${lastName.trim()}`;

  const tenant = await prisma.tenant.create({
    data: {
      name: company.trim(),
      slug,
      status: 'ACTIVE',
      branding: { create: { companyName: company.trim(), primaryColor: '#F97316', secondaryColor: '#EA6100' } },
      stripeSubscription: {
        create: {
          stripeCustomerId: `founding_${member.id}`,
          plan: 'LIFETIME',
          status: 'ACTIVE',
        },
      },
      memberships: {
        create: {
          user: {
            create: {
              email: normalizedEmail,
              name:  fullName,
              passwordHash,
            },
          },
          role:     'HOST_ADMIN',
          status:   'ACTIVE',
          joinedAt: new Date(),
        },
      },
    },
  });

  await prisma.foundingMember.update({
    where: { id: member.id },
    data: {
      status:          'SETUP_COMPLETE',
      tenantId:        tenant.id,
      setupTokenUsedAt: new Date(),
    },
  });

  // Seed email defaults non-blocking
  seedTenantEmailDefaults(tenant.id).catch(e => console.error('[founding-setup] seed error:', e));

  return NextResponse.json({ success: true });
}
