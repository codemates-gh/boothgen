export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice } from '@/lib/genie/auth';

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId: auth.tenant.id }, select: { companyName: true } });
  return NextResponse.json({
    deviceId: auth.device.id,
    deviceName: auth.device.name,
    tenantName: branding?.companyName || auth.tenant.name,
    // Empty until the operator sets a PIN on the Genie devices page
    attendantPinHash: auth.tenant.genieAttendantPinHash ?? '',
    minAppVersion: process.env.GENIE_MIN_APP_VERSION ?? '1.0.0',
  });
}
