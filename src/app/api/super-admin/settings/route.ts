export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

const ALLOWED_KEYS = ['message_retention_months', 'gallery_expire_days', 'gallery_delete_days', 'email_template_welcome', 'email_template_forgot_password', 'stripe_price_monthly_id', 'stripe_price_annual_id', 'price_display_monthly', 'price_display_annual', 'commission_percentage', 'support_email', 'chatbot_enabled', 'early_adopter_cap'];

export async function GET() {
  await requireSuperAdminSession();
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ALLOWED_KEYS } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return NextResponse.json({
    message_retention_months: map.message_retention_months ?? '12',
    gallery_expire_days: map.gallery_expire_days ?? '30',
    gallery_delete_days: map.gallery_delete_days ?? '30',
  });
}

export async function PATCH(req: NextRequest) {
  await requireSuperAdminSession();
  const body = await req.json();
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(body[key]) },
        create: { key, value: String(body[key]) },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
