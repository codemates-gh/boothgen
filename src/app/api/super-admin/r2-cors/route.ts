export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { setR2CorsPolicy } from '@/lib/storage/r2';

export async function POST(req: NextRequest) {
  await requireSuperAdminSession();
  const origins = [
    'https://boothgen.com',
    'https://www.boothgen.com',
    'http://localhost:3000',
  ];
  // Allow any Vercel preview deployment too
  const body = await req.json().catch(() => ({}));
  if (body.extraOrigin) origins.push(body.extraOrigin);

  await setR2CorsPolicy(origins);
  return NextResponse.json({ ok: true, origins });
}
