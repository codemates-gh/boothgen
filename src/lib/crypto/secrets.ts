import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM for tenant-supplied credentials stored in the database.
// SECRETS_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32).
// Ciphertext format: v1:<iv b64>:<auth tag b64>:<data b64>

function key(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new Error('SECRETS_ENCRYPTION_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes (base64)');
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// For showing a saved secret without revealing it: "••••••••a1b2"
export function maskSecret(plain: string): string {
  return '••••••••' + plain.slice(-4);
}
