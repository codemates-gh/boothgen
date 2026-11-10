#!/usr/bin/env node
// Local test data for Genie (iPad app) development. Local databases only.
//
//   npm run genie:seed            create/refresh the test tenant, event, templates and a pairing code
//   npm run genie:seed -- --pair  just issue a new pairing code for the test tenant
//
// Asset URLs use NEXT_PUBLIC_APP_URL, so set it to http://<your Mac's LAN IP>:3000 in .env before
// seeding when an iPad will download the bundle.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const DB = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DB)) {
  console.error('Refusing to seed: DATABASE_URL is not a local database.');
  process.exit(1);
}

const prisma = new PrismaClient();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SLUG = 'genie-dev';
const LOGIN = { email: 'genie-dev@boothgen.test', password: 'genie-dev-1234' };

// ── tiny PNG encoder (RGBA) ─────────────────────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const inside = (x, y, s) => x >= s.x && x < s.x + s.width && y >= s.y && y < s.y + s.height;

// ── layouts ─────────────────────────────────────────────────────────────────
const LANDSCAPE_SLOTS = [
  { id: 'a', shotIndex: 0, x: 60, y: 60, width: 1050, height: 1080, rotationDegrees: 0, fit: 'fill' },
  { id: 'b', shotIndex: 1, x: 1170, y: 60, width: 570, height: 510, rotationDegrees: 0, fit: 'fill' },
  { id: 'c', shotIndex: 2, x: 1170, y: 630, width: 570, height: 510, rotationDegrees: 0, fit: 'fill' },
];
const STRIP_SLOTS = [0, 1, 2].map(i => ({ id: 's' + (i + 1), shotIndex: i, x: 30, y: 30 + i * 435, width: 540, height: 405, rotationDegrees: 0, fit: 'fill' }));

function writeAsset(name, buf) {
  const dir = path.join(process.cwd(), 'public', 'genie-seed');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), buf);
  return { url: `${APP_URL}/genie-seed/${name}`, sha256: createHash('sha256').update(buf).digest('hex'), contentType: 'image/png', bytes: buf.length };
}

function makeAssets() {
  // 4x6 landscape background: warm gradient with a darker band behind the photo boxes
  const background = writeAsset('background-4x6.png', png(1800, 1200, (x, y) => {
    const t = (x + y) / 3000;
    const frame = LANDSCAPE_SLOTS.some(s => inside(x, y, { x: s.x - 12, y: s.y - 12, width: s.width + 24, height: s.height + 24 }));
    return frame ? [255, 255, 255, 255] : [Math.round(249 - 40 * t), Math.round(115 + 60 * t), Math.round(22 + 120 * t), 255];
  }));
  // 2x6 strip overlay: navy frame with transparent windows over the slots
  const overlay = writeAsset('overlay-2x6.png', png(600, 1800, (x, y) => {
    if (STRIP_SLOTS.some(s => inside(x, y, s))) return [0, 0, 0, 0];
    return y > 1360 ? [249, 115, 22, 255] : [31, 31, 61, 255];
  }));
  return { background, overlay };
}

async function newPairingCode(tenantId) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    try {
      return await prisma.geniePairingCode.create({ data: { tenantId, code, expiresAt: new Date(Date.now() + 10 * 60000) } });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
    }
  }
  throw new Error('Could not generate a unique pairing code');
}

async function main() {
  if (process.argv.includes('--pair')) {
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
    if (!tenant) throw new Error('Run npm run genie:seed first');
    const pc = await newPairingCode(tenant.id);
    console.log(`Pairing code: ${pc.code} (expires ${pc.expiresAt.toLocaleTimeString()})`);
    return;
  }

  // Start clean: the tenant cascade removes its events, galleries, devices and Genie rows
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: LOGIN.email } });

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Genie Dev Booths', slug: SLUG, status: 'ACTIVE', genieEnabled: true, genieEnabledAt: new Date(),
      branding: { create: { companyName: 'Genie Dev Booths', primaryColor: '#F97316' } },
      stripeSubscription: { create: { plan: 'LIFETIME', status: 'ACTIVE', stripeCustomerId: 'cus_genie_dev' } },
    },
  });
  const user = await prisma.user.create({ data: { email: LOGIN.email, name: 'Genie Dev', passwordHash: await bcrypt.hash(LOGIN.password, 10) } });
  await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'HOST_ADMIN', status: 'ACTIVE', joinedAt: new Date() } });
  const client = await prisma.client.create({ data: { tenantId: tenant.id, firstName: 'Ana', lastName: 'Rivera', email: 'ana.rivera@example.com' } });

  // Event today, 6–10 pm local; the bundle stays valid until 24 h after it ends
  const now = new Date();
  const day = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); // BoothGen stores the date at UTC midnight
  const start = new Date(now); start.setHours(18, 0, 0, 0);
  const end = new Date(now); end.setHours(22, 0, 0, 0);
  const event = await prisma.event.create({
    data: { tenantId: tenant.id, clientId: client.id, title: 'Rivera Wedding (Genie test)', status: 'BOOKED', eventDate: day, startTime: start, endTime: end, venueName: 'The Glasshouse' },
  });
  await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: event.title + ' Gallery' } });

  await prisma.eventGenieSettings.create({
    data: {
      tenantId: tenant.id, eventId: event.id,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      shotCount: 3,
      processing: [{ type: 'sharpen', radius: 1.5, intensity: 0.3 }, { type: 'jpegQuality', quality: 0.9 }],
      guestFiltersEnabled: true,
      defaultFilterId: 'original',
      filters: [
        { id: 'original', name: 'Original', steps: [] },
        { id: 'warm', name: 'Warm', steps: [{ type: 'colorPreset', preset: 'warm', intensity: 0.5 }] },
        { id: 'bw', name: 'Black & White', steps: [{ type: 'colorPreset', preset: 'blackAndWhite', intensity: 1 }] },
      ],
      smsBody: 'Hi {{firstName}}! Here are your photos from {{eventName}}: {{link}}',
      emailSubject: 'Your photos from {{eventName}}',
      emailBody: 'Hi {{firstName}},\n\nThanks for stopping by the booth! Your photos: {{link}}',
      smsConsentText: 'I agree to receive one text message with my photos. Msg & data rates may apply.',
    },
  });

  const { background, overlay } = makeAssets();
  await prisma.eventGenieTemplate.create({
    data: {
      tenantId: tenant.id, eventId: event.id, name: '4x6 Landscape', sortOrder: 0,
      layout: { format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200, dpi: 300, backgroundColor: '#F97316', background, slots: LANDSCAPE_SLOTS },
    },
  });
  await prisma.eventGenieTemplate.create({
    data: {
      tenantId: tenant.id, eventId: event.id, name: '2x6 Strip', sortOrder: 1,
      layout: { format: '2x6', orientation: 'portrait', widthPx: 600, heightPx: 1800, dpi: 300, backgroundColor: '#1F1F3D', overlay, slots: STRIP_SLOTS },
    },
  });

  const pc = await newPairingCode(tenant.id);
  console.log([
    'Genie dev data ready.',
    `  BoothGen login:  ${LOGIN.email} / ${LOGIN.password}   (${APP_URL}/sign-in)`,
    `  Event:           ${event.title}  id=${event.id}`,
    `  Templates:       4x6 landscape (background PNG), 2x6 strip (overlay PNG); assets under ${APP_URL}/genie-seed/`,
    `  Pairing code:    ${pc.code}  (expires ${pc.expiresAt.toLocaleTimeString()}; new one: npm run genie:seed -- --pair)`,
    '  Guest SMS/email: off until you add your own Twilio / email in Settings → Genie.',
  ].join('\n'));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
