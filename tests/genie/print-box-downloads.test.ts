import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD } from '@/app/downloads/print-box/[...file]/route';

const req = (path: string) => new NextRequest('https://boothgen.test/downloads/print-box/' + path);
const call = (file: string[]) => GET(req(file.join('/')), { params: { file } });

describe('print box downloads redirect', () => {
  const prev = process.env.GENIE_DOWNLOADS_URL;
  afterEach(() => { process.env.GENIE_DOWNLOADS_URL = prev; });

  it('temporarily redirects any file to the bucket, uncached', async () => {
    process.env.GENIE_DOWNLOADS_URL = 'https://pub-abc.r2.dev/';
    for (const f of ['latest.yml', 'Genie-Print-Box-Setup-0.4.1.exe.blockmap', 'Genie-Print-Box-Setup.exe']) {
      const r = await call([f]);
      expect(r.status).toBe(307);
      expect(r.headers.get('location')).toBe('https://pub-abc.r2.dev/print-box/' + f);
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
    const h = await HEAD(req('latest.yml'), { params: { file: ['latest.yml'] } });
    expect(h.status).toBe(307);
  });

  it('keeps nested paths and encodes names', async () => {
    process.env.GENIE_DOWNLOADS_URL = 'https://pub-abc.r2.dev';
    const r = await call(['beta', 'a b.exe']);
    expect(r.headers.get('location')).toBe('https://pub-abc.r2.dev/print-box/beta/a%20b.exe');
  });

  it('404s without the env var or on path tricks', async () => {
    delete process.env.GENIE_DOWNLOADS_URL;
    expect((await call(['latest.yml'])).status).toBe(404);
    process.env.GENIE_DOWNLOADS_URL = 'https://pub-abc.r2.dev';
    expect((await call(['..', 'secret'])).status).toBe(404);
  });
});
