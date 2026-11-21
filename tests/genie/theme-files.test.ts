import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

// Geniefied theme files checked against storage before a bundle (iPads drop a theme whose sample doesn't match)

const BASE = 'https://media.boothgen.test/';
const store = new Map<string, Buffer>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  headR2Object: vi.fn(async (key: string) => (store.has(key) ? { bytes: store.get(key)!.length } : null)),
  getR2Object: vi.fn(async (key: string) => (store.has(key) ? { body: store.get(key)!, contentType: 'image/jpeg' } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer) => { store.set(key, body); return key; }),
  deleteFromR2: vi.fn(async (key: string) => { store.delete(key); }),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));
const JPEG = (s: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from(s)]);
vi.mock('@/lib/genie/ai/image', () => ({
  toJpeg: vi.fn(async (b: Buffer) => ({ body: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('small:' + b.length)]), width: 360, height: 360 })),
  placeholderJpeg: vi.fn(async (seed: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('placeholder:' + seed)])),
}));

import { prisma } from '@/lib/prisma/client';
import { verifyThemeFiles } from '@/lib/genie/ai/themeFiles';
import { resetDb, seedTenant } from './helpers';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const put = (key: string, body: Buffer) => { store.set(key, body); return { url: BASE + key, sha256: sha(body), contentType: 'image/jpeg', bytes: body.length }; };
const K = (tenantId: string) => `genie-ai-themes/${tenantId}/`;

beforeEach(async () => {
  await resetDb(); store.clear();
  (globalThis as { __themeFileCheck?: boolean }).__themeFileCheck = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: url.startsWith(BASE) && store.has(url.slice(BASE.length)) })));
});
afterAll(async () => { (globalThis as { __themeFileCheck?: boolean }).__themeFileCheck = false; vi.unstubAllGlobals(); await resetDb(); await prisma.$disconnect(); });

async function theme(make: (k: string) => { sample: unknown; thumbnail: unknown }) {
  const { tenant } = await seedTenant();
  const f = make(K(tenant.id));
  return prisma.genieAiTheme.create({ data: { tenantId: tenant.id, name: 'Red carpet', prompt: 'p', sample: f.sample as object, thumbnail: (f.thumbnail ?? undefined) as object | undefined } });
}

describe('Geniefied theme files', () => {
  it('leaves good files alone, and checks each theme at most every 10 minutes', async () => {
    const t = await theme(k => ({ sample: put(k + 'a.jpg', JPEG('a')), thumbnail: put(k + 'thumbs/a.jpg', JPEG('ta')) }));
    expect(await verifyThemeFiles(t, 1e12)).toBe(t);
    store.clear();
    expect(await verifyThemeFiles(t, 1e12 + 60_000)).toBe(t);
  });

  it('corrects a stored sha256 / byte count that no longer matches the file', async () => {
    let good: unknown;
    const t = await theme(k => { good = put(k + 'b.jpg', JPEG('real sample')); return { sample: { ...(good as object), sha256: 'f'.repeat(64), bytes: 3 }, thumbnail: put(k + 'thumbs/b.jpg', JPEG('tb')) }; });
    expect((await verifyThemeFiles(t, 2e12)).sample).toEqual(good);
  });

  it('remakes a missing thumbnail from the sample; a missing sample becomes a placeholder', async () => {
    const t = await theme(k => ({ sample: put(k + 'c.jpg', JPEG('c')), thumbnail: { url: BASE + k + 'thumbs/gone.jpg', sha256: 'e'.repeat(64), contentType: 'image/jpeg', bytes: 10 } }));
    const th = (await verifyThemeFiles(t, 3e12)).thumbnail as { url: string; sha256: string };
    expect(th.url).toMatch(/\/thumbs\/[0-9a-f]{64}\.jpg$/);
    expect(sha(store.get(th.url.slice(BASE.length))!)).toBe(th.sha256);

    const lost = await theme(k => ({ sample: { url: BASE + k + 'lost.jpg', sha256: 'd'.repeat(64), contentType: 'image/jpeg', bytes: 10 }, thumbnail: null }));
    expect(((await verifyThemeFiles(lost, 4e12)).sample as { url: string }).url).toContain('/placeholders/');
  });

  it('stores a sample that is not a JPEG or PNG again as a JPEG', async () => {
    const t = await theme(k => ({ sample: put(k + 'webp.jpg', Buffer.from('RIFF....WEBP')), thumbnail: put(k + 'thumbs/w.jpg', JPEG('tw')) }));
    const s = (await verifyThemeFiles(t, 5e12)).sample as { url: string; sha256: string; contentType: string };
    expect(s.contentType).toBe('image/jpeg');
    expect(store.get(s.url.slice(BASE.length))![0]).toBe(0xff);
  });
});
