
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = headers();
  const svixId = headersList.get('svix-id') ?? '';
  const svixTs = headersList.get('svix-timestamp') ?? '';
  const svixSig = headersList.get('svix-signature') ?? '';
  let evt: any;
  try {
    evt = new Webhook(process.env.CLERK_WEBHOOK_SECRET!).verify(body, { 'svix-id': svixId, 'svix-timestamp': svixTs, 'svix-signature': svixSig });
  } catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }

  const { type, data } = evt;

  if (type === 'organization.created') {
    const slug = data.slug ?? data.id;
    await prisma.tenant.upsert({
      where: { clerkOrgId: data.id },
      update: { name: data.name },
      create: { clerkOrgId: data.id, name: data.name, slug, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 14 * 86400000), branding: { create: { companyName: data.name, primaryColor: '#F97316' } } },
    });
  }

  if (type === 'user.created' || type === 'user.updated') {
    const email = data.email_addresses?.[0]?.email_address ?? '';
    await prisma.user.upsert({
      where: { clerkUserId: data.id },
      update: { name: (data.first_name ?? '') + ' ' + (data.last_name ?? ''), email, avatarUrl: data.image_url },
      create: { clerkUserId: data.id, name: (data.first_name ?? '') + ' ' + (data.last_name ?? ''), email, avatarUrl: data.image_url },
    });
  }

  if (type === 'organizationMembership.created') {
    const org = await prisma.tenant.findFirst({ where: { clerkOrgId: data.organization?.id } });
    const user = await prisma.user.findFirst({ where: { clerkUserId: data.public_user_data?.user_id } });
    if (org && user) {
      const role = data.role === 'org:admin' ? 'HOST_ADMIN' : 'TEAM_MEMBER';
      await prisma.tenantMembership.upsert({ where: { tenantId_userId: { tenantId: org.id, userId: user.id } }, update: { status: 'ACTIVE', role }, create: { tenantId: org.id, userId: user.id, role, status: 'ACTIVE', joinedAt: new Date() } });
    }
  }

  if (type === 'organizationMembership.deleted') {
    const org = await prisma.tenant.findFirst({ where: { clerkOrgId: data.organization?.id } });
    const user = await prisma.user.findFirst({ where: { clerkUserId: data.public_user_data?.user_id } });
    if (org && user) await prisma.tenantMembership.updateMany({ where: { tenantId: org.id, userId: user.id }, data: { status: 'SUSPENDED' } });
  }

  return NextResponse.json({ received: true });
}
