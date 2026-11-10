import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { newDeviceToken } from '@/lib/genie/auth';
import { GENIE_SETTINGS_DEFAULTS } from '@/lib/genie/bundle';
import { encryptSecret } from '@/lib/crypto/secrets';

export const SAMPLE_SHA = '9f2c0e5c3b1a4d6e8f7a9b0c1d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6';

export const SAMPLE_LAYOUT = {
  format: '2x6',
  orientation: 'portrait',
  widthPx: 600,
  heightPx: 1800,
  dpi: 300,
  backgroundColor: '#FFFFFF',
  overlay: { url: 'https://media.boothgen.test/templates/rivera.png', sha256: SAMPLE_SHA, contentType: 'image/png', bytes: 482113 },
  slots: [0, 1, 2].map(i => ({ id: 's' + (i + 1), shotIndex: i, x: 30, y: 30 + i * 435, width: 540, height: 405, rotationDegrees: 0, fit: 'fill' })),
};

export async function resetDb() {
  // Tenants cascade to everything the tests create
  await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'genie-test-' } } });
}

export const TWILIO_SID = 'AC' + 'a'.repeat(32);
export const TWILIO_TOKEN = 'tenant-auth-token';

export async function seedTenant(opts: { genieEnabled?: boolean; pro?: boolean; messaging?: boolean } = {}) {
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Genie Test ' + randomUUID().slice(0, 6),
      slug: 'genie-test-' + randomUUID(),
      genieEnabled: opts.genieEnabled ?? true,
      genieEnabledAt: new Date(),
      ...(opts.pro === false ? {} : {
        stripeSubscription: { create: { plan: 'LIFETIME', status: 'ACTIVE', stripeCustomerId: 'cus_' + randomUUID() } },
      }),
    },
  });
  if (opts.messaging !== false) {
    await prisma.genieMessagingConfig.create({
      data: {
        tenantId: tenant.id, twilioAccountSid: TWILIO_SID, twilioAuthTokenEnc: encryptSecret(TWILIO_TOKEN), twilioMessagingServiceSid: 'MG' + 'b'.repeat(32),
        emailProvider: 'resend', emailFromName: 'Snap Co', emailFromAddress: 'photos@snap.test', resendApiKeyEnc: encryptSecret('re_tenant_key'),
      },
    });
  }
  const client = await prisma.client.create({ data: { tenantId: tenant.id, firstName: 'Ana', lastName: 'Rivera', email: randomUUID() + '@example.com' } });
  return { tenant, client };
}

export async function seedEvent(tenantId: string, clientId: string, opts: { settings?: boolean; templates?: number; status?: 'BOOKED' | 'IN_PROGRESS' | 'LEAD' } = {}) {
  const event = await prisma.event.create({
    data: {
      tenantId, clientId, title: 'Rivera Wedding', status: opts.status ?? 'BOOKED',
      eventDate: new Date('2026-12-12T12:00:00Z'),
      startTime: new Date('2026-12-12T23:00:00Z'), endTime: new Date('2026-12-13T03:00:00Z'),
      venueName: 'The Glasshouse',
    },
  });
  if (opts.settings !== false) {
    await prisma.eventGenieSettings.create({ data: { tenantId, eventId: event.id, timeZone: 'America/Los_Angeles', ...GENIE_SETTINGS_DEFAULTS } });
  }
  for (let i = 0; i < (opts.templates ?? 1); i++) {
    await prisma.eventGenieTemplate.create({ data: { tenantId, eventId: event.id, name: 'Template ' + (i + 1), sortOrder: i, layout: SAMPLE_LAYOUT } });
  }
  return event;
}

export async function seedDevice(tenantId: string, opts: { revoked?: boolean } = {}) {
  const { token, prefix, tokenHash } = newDeviceToken();
  const device = await prisma.genieDevice.create({
    data: { tenantId, name: 'Booth iPad', model: 'iPad7,3', appVersion: '1.0.0', tokenHash, prefix, revokedAt: opts.revoked ? new Date() : null },
  });
  return { device, token };
}

export function req(path: string, opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = 'Bearer ' + opts.token;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest('https://boothgen.test' + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export function guestSession() {
  return { id: randomUUID(), publicToken: randomUUID().replace(/-/g, '').slice(0, 24), startedAt: '2026-12-12T23:41:05Z' };
}

// AJV validator for the Genie EventBundle schema (null when the Genie repo isn't on this machine)
export const GENIE_SHARED_DIR = process.env.GENIE_SHARED_DIR ?? '/Volumes/EXT1TB_Samsung/dev/Genie/shared';
export async function bundleValidator(): Promise<((b: unknown) => string | null) | null> {
  const { existsSync, readdirSync, readFileSync } = await import('fs');
  const path = await import('path');
  const dir = path.join(GENIE_SHARED_DIR, 'schemas');
  if (!existsSync(dir)) return null;
  const { default: Ajv2020 } = await import('ajv/dist/2020');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) ajv.addSchema(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  const validate = ajv.getSchema('https://schemas.boothgenius.com/genie/v1/EventBundle.json')!;
  return b => (validate(b) ? null : ajv.errorsText(validate.errors));
}
