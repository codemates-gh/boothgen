import { createHash, randomUUID } from 'crypto';
import { getR2Object, r2KeyForPublicUrl } from '@/lib/storage/r2';
import { readImageInfo, type ImageInfo } from './image';

export const TEMPLATE_ASSET_MAX_BYTES = 15 * 1024 * 1024;
export type RemoteAsset = { url: string; sha256: string; contentType: 'image/png' | 'image/jpeg'; bytes: number };
export type Scope = 'mine' | 'standard';

// Where designer uploads go: Standard (BoothGen-managed) artwork is shared, My templates' artwork is per tenant
// (tenantId is null for a BoothGen super admin working outside an account: Standard only)
export function assetPrefix(scope: Scope, tenantId: string | null): string {
  if (scope !== 'standard' && !tenantId) throw new Error('My templates need an account');
  return scope === 'standard' ? 'genie-templates/standard/' : `genie-templates/${tenantId}/`;
}

export function newAssetKey(scope: Scope, tenantId: string | null, contentType: string): string {
  return assetPrefix(scope, tenantId) + randomUUID() + (contentType === 'image/png' ? '.png' : '.jpg');
}

// R2 keys a template may reference: its own folder, Standard artwork (duplicated templates), and the tenant's
// client-approved design files (templates/<tenantId>/...)
export function allowedPrefixes(scope: Scope, tenantId: string | null): string[] {
  return scope === 'standard' || !tenantId
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

// Designer images a template stopped using (replaced background/overlay, old thumbnail) are deleted from R2, but only
// when no library template and no event template still points at them: copies onto events and duplicates share the
// same files. Only designer uploads (genie-templates/...) are ever deleted, never client design files.
export function templateAssetUrls(t: { layout?: unknown; alternateLayout?: unknown; genieThumbnail?: unknown } | null): string[] {
  if (!t) return [];
  const urls: string[] = [];
  for (const l of [t.layout, t.alternateLayout] as any[]) {
    if (l?.background?.url) urls.push(l.background.url);
    if (l?.overlay?.url) urls.push(l.overlay.url);
  }
  if ((t.genieThumbnail as any)?.url) urls.push((t.genieThumbnail as any).url);
  return urls;
}

export async function deleteUnusedTemplateAssets(urls: string[]): Promise<number> {
  const { prisma } = await import('@/lib/prisma/client');
  const { deleteFromR2 } = await import('@/lib/storage/r2');
  let deleted = 0;
  for (const url of Array.from(new Set(urls))) {
    const key = keyForUrl(url);
    if (!key || !key.startsWith('genie-templates/')) continue;
    const pattern = '%' + url.replace(/[\\%_]/g, m => '\\' + m) + '%';
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM booth_design_templates WHERE layout::text LIKE ${pattern} OR "alternateLayout"::text LIKE ${pattern} OR "genieThumbnail"::text LIKE ${pattern})
        + (SELECT count(*) FROM event_genie_templates WHERE layout::text LIKE ${pattern} OR "alternateLayout"::text LIKE ${pattern} OR thumbnail::text LIKE ${pattern})
      ) AS n`;
    if (Number(n) > 0) continue;
    try { await deleteFromR2(key); deleted++; } catch (err) { console.error('[genie] template asset cleanup failed', key, err); }
  }
  return deleted;
}
