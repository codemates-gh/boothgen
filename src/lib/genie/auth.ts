import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import type { GenieDevice, Tenant } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

// Contract error shape: { error, code }
export function genieError(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status });
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newDeviceToken(): { token: string; prefix: string; tokenHash: string } {
  const token = 'gn_' + randomBytes(32).toString('base64url');
  return { token, prefix: token.slice(0, 10), tokenHash: hashDeviceToken(token) };
}

export type GenieDeviceAuth = { device: GenieDevice; tenant: Tenant };

const LAST_SEEN_INTERVAL_MS = 60_000;

// Free/total storage the app reports in X-Genie-Storage-Free / X-Genie-Storage-Total (bytes)
function reportedStorage(req: NextRequest) {
  const parse = (v: string | null) => (v && /^\d{1,16}$/.test(v) ? BigInt(v) : null);
  const free = parse(req.headers.get('x-genie-storage-free'));
  const total = parse(req.headers.get('x-genie-storage-total'));
  return free === null ? null : { storageFreeBytes: free, storageTotalBytes: total, storageReportedAt: new Date() };
}

// Shown as "Low storage" on the Genie devices page
export function isLowStorage(d: { storageFreeBytes: bigint | null; storageTotalBytes: bigint | null }): boolean {
  if (d.storageFreeBytes === null) return false;
  const free = Number(d.storageFreeBytes);
  const total = d.storageTotalBytes ? Number(d.storageTotalBytes) : null;
  return free < 5 * 1024 ** 3 || (total !== null && free / total < 0.1);
}

// Resolves the device from its bearer token. Every Genie query must be scoped to auth.tenant.id.
export async function authenticateDevice(req: NextRequest): Promise<GenieDeviceAuth | NextResponse> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return genieError(401, 'unauthorized', 'Missing device token');

  const device = await prisma.genieDevice.findUnique({
    where: { tokenHash: hashDeviceToken(match[1]) },
    include: { tenant: true },
  });
  if (!device) return genieError(401, 'unauthorized', 'Invalid device token');
  if (device.revokedAt) return genieError(401, 'device_revoked', 'This device has been removed');
  if (!device.tenant.genieEnabled) return genieError(403, 'genie_not_enabled', 'Genie is not enabled for this account');

  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
    await prisma.genieDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), ...reportedStorage(req) } });
  }
  const { tenant, ...rest } = device;
  return { device: rest, tenant };
}

// Event lookup scoped to the device's tenant
export async function findDeviceEvent(auth: GenieDeviceAuth, eventId: string) {
  return prisma.event.findFirst({ where: { id: eventId, tenantId: auth.tenant.id } });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as any)?.code === 'P2002';
}
