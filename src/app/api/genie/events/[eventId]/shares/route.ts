export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice, findDeviceEvent, genieError, isUniqueViolation, readJson } from '@/lib/genie/auth';
import { ensureGallery } from '@/lib/genie/bundle';
import { dispatchReadyShares, ensureGenieSession } from '@/lib/genie/sessions';
import { ShareJob, firstIssue } from '@/lib/genie/schemas';
import { emailConfigured, getMessagingConfig, smsConfigured } from '@/lib/genie/messaging';

const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = ShareJob.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const body = parsed.data;

  const existing = await prisma.genieShare.findUnique({ where: { clientId: body.id } });
  if (existing) {
    if (existing.tenantId !== auth.tenant.id || existing.eventId !== event.id) return genieError(422, 'share_conflict', 'This share id belongs to another event');
    return NextResponse.json({ id: body.id, status: existing.status }, { status: 202 });
  }

  if (body.channel === 'sms' && !body.smsConsentAt) return genieError(422, 'consent_required', 'SMS shares require smsConsentAt');
  if (body.channel === 'sms' && !E164.test(body.destination)) return genieError(422, 'invalid_destination', 'Phone number must be in E.164 format');
  if (body.channel === 'email' && !EMAIL.test(body.destination)) return genieError(422, 'invalid_destination', 'Invalid email address');

  const settings = await prisma.eventGenieSettings.findUnique({ where: { eventId: event.id } });
  if (!settings) return genieError(422, 'not_configured', 'Genie settings have not been set up for this event');
  const messaging = await getMessagingConfig(auth.tenant.id);
  const enabled = body.channel === 'sms'
    ? settings.smsEnabled && smsConfigured(messaging)
    : settings.emailEnabled && emailConfigured(messaging);
  if (!enabled) {
    return genieError(422, 'channel_disabled', `${body.channel === 'sms' ? 'Text' : 'Email'} sharing is turned off or not set up for this account`);
  }

  const gallery = await ensureGallery(event);
  const session = await ensureGenieSession(event, gallery, auth.device.id, body.session);
  if (!session) return genieError(422, 'session_conflict', 'This session id or token belongs to another event');

  try {
    await prisma.genieShare.create({
      data: {
        tenantId: auth.tenant.id,
        eventId: event.id,
        sessionId: session.id,
        clientId: body.id,
        channel: body.channel,
        destination: body.destination,
        firstName: body.firstName ?? null,
        smsConsentAt: body.smsConsentAt ? new Date(body.smsConsentAt) : null,
        smsConsentText: body.channel === 'sms' ? settings.smsConsentText : null,
        requestedAt: new Date(body.createdAt),
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.genieShare.findUnique({ where: { clientId: body.id } });
    if (raced?.tenantId !== auth.tenant.id || raced.eventId !== event.id) return genieError(422, 'share_conflict', 'This share id belongs to another event');
    return NextResponse.json({ id: body.id, status: raced.status }, { status: 202 });
  }

  await dispatchReadyShares(session.id);
  return NextResponse.json({ id: body.id, status: 'queued' }, { status: 202 });
}
