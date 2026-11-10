import { afterEach, describe, expect, it, vi } from 'vitest';

// r2.ts reads R2_PUBLIC_URL when it loads, so each case loads a fresh copy
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('@/lib/storage/r2');
}
afterEach(() => vi.unstubAllEnvs());

describe('R2 public URLs after moving to a custom domain', () => {
  it('finds keys under the new domain and the old r2.dev address', async () => {
    const r2 = await load({ R2_PUBLIC_URL: 'https://photos.boothgen.com', R2_LEGACY_PUBLIC_URLS: 'https://pub-old.r2.dev/' });
    expect(r2.r2PublicUrl('galleries/t/a.jpg')).toBe('https://photos.boothgen.com/galleries/t/a.jpg');
    expect(r2.r2KeyFromUrl('https://photos.boothgen.com/galleries/t/a.jpg')).toBe('galleries/t/a.jpg');
    expect(r2.r2KeyFromUrl('https://pub-old.r2.dev/galleries/t/b.jpg')).toBe('galleries/t/b.jpg');
    expect(r2.r2KeyForPublicUrl('https://evil.test/galleries/t/b.jpg')).toBeNull();
    expect(r2.r2KeyForPublicUrl('https://pub-old.r2.devX/galleries/t/b.jpg')).toBeNull();
  });

  it('works unchanged with no legacy addresses', async () => {
    const r2 = await load({ R2_PUBLIC_URL: 'https://pub-old.r2.dev', R2_LEGACY_PUBLIC_URLS: '' });
    expect(r2.r2KeyFromUrl('https://pub-old.r2.dev/branding/t/logo.png')).toBe('branding/t/logo.png');
    expect(r2.r2PublicBases()).toEqual(['https://pub-old.r2.dev']);
  });
});
