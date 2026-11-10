import { createHash, randomUUID } from 'crypto';
import { getR2Object, r2KeyForPublicUrl } from '@/lib/storage/r2';
import { readImageInfo, type ImageInfo } from './image';

export const TEMPLATE_ASSET_MAX_BYTES = 15 * 1024 * 1024;
export type RemoteAsset = { url: string; sha256: string; contentType: 'image/png' | 'image/jpeg'; bytes: number };
export type Scope = 'mine' | 'standard';

// Where designer uploads go: Standard (BoothGen-managed) artwork is shared, My templates' artwork is per tenant
export function assetPrefix(scope: Scope, tenantId: string): string {
  return scope === 'standard' ? 'genie-templates/standard/' : `genie-templates/${tenantId}/`;
}

export function newAssetKey(scope: Scope, tenantId: string, contentType: string): string {
  return assetPrefix(scope, tenantId) + randomUUID() + (contentType === 'image/png' ? '.png' : '.jpg');
}

// R2 keys a template may reference: its own folder, Standard artwork (duplicated templates), and the tenant's
// client-approved design files (templates/<tenantId>/...)
export function allowedPrefixes(scope: Scope, tenantId: string): string[] {
  return scope === 'standard'
    ? ['genie-templates/standard/']
    : [`genie-templates/${tenantId}/`, 'genie-templates/standard/', `templates/${tenantId}/`];
}

// Accepts the current public address and earlier ones (R2_LEGACY_PUBLIC_URLS)
export function keyForUrl(url: string): string | null {
  return r2KeyForPublicUrl(url);
}

export type VerifiedAsset = { asset: RemoteAsset; info: ImageInfo };

// Reads the stored file and builds the RemoteAsset from what is actually there (type, size, sha256)
export async function verifyAsset(url: string, prefixes: string[]): Promise<VerifiedAsset | { error: string }> {
  const key = keyForUrl(url);
  if (!key || key.includes('..') || !prefixes.some(p => key.startsWith(p))) return { error: "That image isn't in your account's storage." };
  const obj = await getR2Object(key);
  if (!obj) return { error: "That image hasn't finished uploading. Try again." };
  if (obj.body.length > TEMPLATE_ASSET_MAX_BYTES) return { error: 'Images must be 15 MB or smaller.' };
  const info = readImageInfo(obj.body);
  if (!info) return { error: 'Use a PNG or JPG image.' };
  return {
    asset: { url, sha256: createHash('sha256').update(obj.body).digest('hex'), contentType: info.contentType, bytes: obj.body.length },
    info,
  };
}
