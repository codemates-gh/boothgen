import { randomInt } from 'crypto';
import { prisma } from '@/lib/prisma/client';

// No 0/O/1/I so codes read clearly off the screen
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_CODE_TTL_MS = 10 * 60_000;

// New 10-minute code for the tenant; any earlier unused code stops working
export async function createPairingCode(tenantId: string) {
  const now = new Date();
  await prisma.geniePairingCode.updateMany({ where: { tenantId, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    try {
      return await prisma.geniePairingCode.create({ data: { tenantId, code, expiresAt: new Date(now.getTime() + PAIRING_CODE_TTL_MS) } });
    } catch (err) {
      if ((err as any)?.code !== 'P2002') throw err;
    }
  }
  throw new Error('Could not generate a unique pairing code');
}

export async function activePairingCode(tenantId: string) {
  return prisma.geniePairingCode.findFirst({ where: { tenantId, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
}
