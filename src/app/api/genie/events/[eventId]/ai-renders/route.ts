export const dynamic = 'force-dynamic';
// The render runs after the 202 answer (after()); image models take up to about a minute
export const maxDuration = 300;
import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { headR2Object } from '@/lib/storage/r2';
import { authenticateDevice, findDeviceEvent, genieError, readJson } from '@/lib/genie/auth';
import { AiRenderRequest, firstIssue } from '@/lib/genie/schemas';
import { aiSettings } from '@/lib/genie/ai/settings';
import { eventThemes } from '@/lib/genie/ai/themes';
import { eventAllowance, processRender, renderStatus, settleStale, startRender } from '@/lib/genie/ai/renders';

// Geniefied (Genie P13): Geniefy one shot of a session. The shot was PUT with an upload-url key (not registered);
// idempotent on idempotencyKey (also the Idempotency-Key header); the allowance is checked atomically.
export async function POST(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = AiRenderRequest.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const b = parsed.data;
  const header = req.headers.get('idempotency-key');
  if (header && header !== b.idempotencyKey) return genieError(400, 'invalid_request', 'Idempotency-Key must match idempotencyKey');

  const s = await prisma.eventGenieSettings.findUnique({ where: { eventId: event.id } });
  if (!s?.aiEnabled || !(await aiSettings()).ready) return genieError(403, 'ai_booth_off', 'Geniefied is off for this event');

  // The same request again: the render it started (its input may be gone by now)
  const existing = await prisma.genieAiRender.findUnique({ where: { eventId_idempotencyKey: { eventId: event.id, idempotencyKey: b.idempotencyKey } } });
  if (existing) return NextResponse.json(await renderStatus(await settleStale(existing), (await eventAllowance(event.id, auth.tenant.id)).left));

  if (!(await eventThemes(s.aiThemeIds, auth.tenant.id)).some(t => t.id === b.themeId)) return genieError(422, 'unknown_theme', "That theme isn't one of this event's");
  const gallery = await prisma.gallery.findUnique({ where: { eventId: event.id }, select: { id: true } });
  const prefix = gallery ? `galleries/${auth.tenant.id}/${gallery.id}/genie-` : null;
  if (!prefix || !b.shotStorageKey.startsWith(prefix) || b.shotStorageKey.includes('..')) return genieError(422, 'invalid_storage_key', "That storage key isn't one of this event's uploads");
  if (!(await headR2Object(b.shotStorageKey))) return genieError(422, 'object_missing', "The shot hasn't been uploaded");

  const started = await startRender({
    tenantId: auth.tenant.id, eventId: event.id, sessionClientId: b.sessionId, shotIndex: b.shotIndex, themeId: b.themeId,
    idempotencyKey: b.idempotencyKey, inputKey: b.shotStorageKey,
    consentAcceptedAt: new Date(b.consent.acceptedAt), consentTextSha256: b.consent.textSha256,
  });
  if (started.kind === 'exhausted') return NextResponse.json({ status: 'allowanceExhausted', rendersLeft: 0 });
  if (started.kind === 'existing') return NextResponse.json(await renderStatus(started.render, started.left));
  const run = () => processRender(started.render.id, b.faceCount);
  try { after(run); } catch { void run(); }
  return NextResponse.json(await renderStatus(started.render, started.left), { status: 202 });
}
