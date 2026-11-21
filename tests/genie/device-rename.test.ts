import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import { prisma } from '@/lib/prisma/client';
import { PATCH as renameDevice } from '@/app/api/genie/device/route';
import { GET as getConfig } from '@/app/api/genie/config/route';
import { GENIE_SHARED_DIR, req, resetDb, seedDevice, seedTenant } from './helpers';

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

const patch = (token: string | undefined, body: unknown) => renameDevice(req('/api/genie/device', { method: 'PATCH', token, body }));

describe('PATCH /api/genie/device (iPad label)', () => {
  it('saves the trimmed label and config answers it as deviceName', async () => {
    const { tenant } = await seedTenant();
    const { device, token } = await seedDevice(tenant.id);
    const res = await patch(token, { name: '  Booth 1 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Booth 1' });
    expect((await prisma.genieDevice.findUniqueOrThrow({ where: { id: device.id } })).name).toBe('Booth 1');
    expect((await (await getConfig(req('/api/genie/config', { token }))).json()).deviceName).toBe('Booth 1');
    // The same name again is fine
    expect((await patch(token, { name: 'Booth 1' })).status).toBe(200);
  });

  it('rejects empty, too long and unknown fields with invalid_request', async () => {
    const { tenant } = await seedTenant();
    const { token } = await seedDevice(tenant.id);
    for (const body of [{ name: '   ' }, { name: 'x'.repeat(81) }, {}, { name: 'A', extra: 1 }, 'nope']) {
      const res = await patch(token, body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('invalid_request');
    }
    expect((await patch(token, { name: 'x'.repeat(80) })).status).toBe(200);
  });

  it('needs a working device token on a Genie account', async () => {
    const { tenant } = await seedTenant();
    const { device, token } = await seedDevice(tenant.id);
    expect((await patch(undefined, { name: 'Booth 1' })).status).toBe(401);
    expect((await patch('bogus', { name: 'Booth 1' })).status).toBe(401);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { genieEnabled: false } });
    expect((await patch(token, { name: 'Booth 1' })).status).toBe(403);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { genieEnabled: true } });
    await prisma.genieDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    const revoked = await patch(token, { name: 'Booth 1' });
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).code).toBe('device_revoked');
  });

  it.skipIf(!existsSync(path.join(GENIE_SHARED_DIR, 'schemas', 'DeviceRename.json')))('matches the Genie DeviceRename schema and fixtures', async () => {
    const ajv = new Ajv2020({ strict: true });
    const validate = ajv.compile(JSON.parse(readFileSync(path.join(GENIE_SHARED_DIR, 'schemas', 'DeviceRename.json'), 'utf8')));
    const { tenant } = await seedTenant();
    const { token } = await seedDevice(tenant.id);
    const fixtures = path.join(GENIE_SHARED_DIR, 'fixtures');
    for (const f of readdirSync(fixtures).filter(f => f.startsWith('DeviceRename.'))) {
      const body = JSON.parse(readFileSync(path.join(fixtures, f), 'utf8'));
      const res = await patch(token, body);
      if (f.includes('invalid')) {
        // The untrimmed fixture is invalid on the wire but BoothGen trims it (the contract says trim server-side too)
        if (f.includes('untrimmed')) { expect(res.status).toBe(200); continue; }
        expect(res.status, f).toBe(400);
      } else {
        expect(res.status, f).toBe(200);
        expect(validate(await res.json()), f).toBe(true);
      }
    }
  });
});
