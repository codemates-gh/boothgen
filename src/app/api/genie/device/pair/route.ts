export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { genieError, newDeviceToken, readJson } from '@/lib/genie/auth';
import { PairRequest, firstIssue } from '@/lib/genie/schemas';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit('genie-pair:' + ip, 10, 600000).success) {
    return genieError(429, 'rate_limited', 'Too many pairing attempts. Try again in a few minutes.');
  }

  const parsed = PairRequest.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const { code, deviceName, deviceModel, appVersion } = parsed.data;

  const pairing = await prisma.geniePairingCode.findUnique({
    where: { code },
    include: { tenant: { include: { branding: { select: { companyName: true } } } } },
  });
  if (!pairing || pairing.usedAt || pairing.expiresAt <= new Date()) {
    return genieError(410, 'code_expired', 'This pairing code is invalid, expired or already used');
  }
  if (!pairing.tenant.genieEnabled) return genieError(403, 'genie_not_enabled', 'Genie is not enabled for this account');

  const { token, prefix, tokenHash } = newDeviceToken();
  const device = await prisma.$transaction(async tx => {
    // Claim the code; a concurrent pair with the same code loses here
    const claimed = await tx.geniePairingCode.updateMany({
      where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const created = await tx.genieDevice.create({
      data: { tenantId: pairing.tenantId, name: deviceName, model: deviceModel, appVersion, tokenHash, prefix, lastSeenAt: new Date() },
    });
    await tx.geniePairingCode.update({ where: { id: pairing.id }, data: { deviceId: created.id } });
    return created;
  });
  if (!device) return genieError(410, 'code_expired', 'This pairing code is invalid, expired or already used');

  return NextResponse.json({
    deviceId: device.id,
    token,
    tenantName: pairing.tenant.branding?.companyName || pairing.tenant.name,
  });
}
