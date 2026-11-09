import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

// Attendant PIN hash shared with Genie devices: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
const ITERATIONS = 210_000;

export function hashAttendantPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyAttendantPin(pin: string, stored: string): boolean {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = pbkdf2Sync(pin, Buffer.from(salt, 'base64'), Number(iter), expected.length, 'sha256');
  return timingSafeEqual(actual, expected);
}
