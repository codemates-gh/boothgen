export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { seedTenantEmailDefaults } from '@/lib/tenant/seed-email-defaults';
import { sendEmail } from '@/lib/email/send';

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

  // Notify super admin of new signup (non-blocking)
  const notifyEmail = process.env.SUPER_ADMIN_NOTIFY_EMAIL;
  if (notifyEmail) {
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
    const adminUrl = `${appUrl}/super-admin`;
    sendEmail(
      notifyEmail,
      `New operator signup — ${name.trim()}`,
      `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:20px;color:#111827;margin:0 0 16px">New Operator Signed Up</h2>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:0 0 24px">
  <p style="margin:0 0 6px;font-weight:700;color:#111827;font-size:16px">${name.trim()}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Owner: ${user?.name ?? 'Unknown'}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Email: ${user?.email ?? 'Unknown'}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Slug: /${tenant.slug}</p>
  <p style="margin:8px 0 0;color:#15803d;font-size:13px;">Status: TRIAL · Plan: Commission</p>
</div>
<p style="margin:0 0 24px"><a href="${adminUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View in Super Admin</a></p>
<p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">Booth Genius internal notification</p>
</div>`,
    ).catch(e => console.error('[create-tenant] admin notify error:', e));
  }

  return NextResponse.json({ success: true, tenantId: tenant.id });
}
