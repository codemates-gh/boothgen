import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma/client';
import { uploadToR2 } from '@/lib/storage/r2';
import { getMessaging, sendEmail, sendSms } from '@/lib/genie/messaging';
import { normalizePhone } from '@/lib/sms/phone';
import { renderMergeFields, shareEmailHtml } from '@/lib/genie/shares';

// "Test Templates" (Genie event page, G 2026-11-20, like Snappic's): the operator texts or emails themselves a
// template drawn with sample photos, through the event's real message, before the event day (when iPads can only
// test). Nothing goes into the event's gallery, sessions or usage. Each send is an AuditLog row, which also counts
// toward the per-event limits (texts cost BoothGen money).
export const TEST_SHARE_LIMITS = { sms: 10, email: 20 } as const;
export const TEST_SHARE_ACTION = 'genie.test_share';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function testSharesUsed(eventId: string): Promise<{ sms: number; email: number }> {
  const rows = await prisma.auditLog.findMany({ where: { action: TEST_SHARE_ACTION, resourceType: 'event', resourceId: eventId }, select: { metadata: true } });
  const by = (c: string) => rows.filter(r => (r.metadata as { channel?: string } | null)?.channel === c).length;
  return { sms: by('sms'), email: by('email') };
}

export type TestShareInput = { channel: 'sms' | 'email'; destination: string; templateName: string; image: string };

// Sends one test (one template). Returns an error message for the operator, or ok.
export async function sendTestShare(tenantId: string, userId: string, eventId: string, input: TestShareInput): Promise<{ ok: true } | { error: string; status: number }> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true, genieSettings: true, tenant: { select: { branding: { select: { primaryColor: true } } } } } });
  const settings = event.genieSettings;
  if (!settings) return { error: 'Set up Genie for this event first', status: 409 };

  const to = input.channel === 'sms' ? normalizePhone(input.destination) : input.destination.trim();
  if (!to || (input.channel === 'email' && !EMAIL.test(to))) {
    return { error: input.channel === 'sms' ? 'Enter a US or Canada phone number, or an international number starting with +' : 'Enter a valid email address', status: 422 };
  }
  const m = await getMessaging(tenantId);
  const enabled = input.channel === 'sms' ? settings.smsEnabled && m.routes.sms !== null : settings.emailEnabled && m.routes.email !== null;
  if (!enabled) return { error: `${input.channel === 'sms' ? 'Text' : 'Email'} sharing is turned off for this event or not set up for this account`, status: 422 };

  const used = await testSharesUsed(eventId);
  if (used[input.channel] >= TEST_SHARE_LIMITS[input.channel]) {
    return { error: `This event has used its ${TEST_SHARE_LIMITS[input.channel]} test ${input.channel === 'sms' ? 'texts' : 'emails'}`, status: 429 };
  }

  const match = /^data:image\/(jpeg|png);base64,(.+)$/.exec(input.image);
  if (!match) return { error: 'Invalid image', status: 400 };
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { error: 'The test image is too large', status: 413 };
  const ext = match[1] === 'png' ? 'png' : 'jpg';
  const link = await uploadToR2(`genie-tests/${tenantId}/${eventId}/${randomUUID()}.${ext}`, bytes, `image/${match[1]}`);

  // The event's own message, with "Test" as the guest's name and the test picture as the link
  const fields = { firstName: 'Test', eventName: event.title, link, expiresOn: '(test)' };
  const text = renderMergeFields(input.channel === 'sms' ? settings.smsBody : settings.emailBody, fields);
  const sent = input.channel === 'sms'
    ? await sendSms(m, to, `[Test] ${text}`)
    : await sendEmail(m, to, `[Test] ${renderMergeFields(settings.emailSubject, fields)}`, shareEmailHtml(`Test of "${input.templateName}". ${text}`, link, event.tenant.branding?.primaryColor), text);
  if (!sent.ok) return { error: sent.error || 'Could not send the test', status: 502 };

  await prisma.auditLog.create({
    data: { tenantId, userId, action: TEST_SHARE_ACTION, resourceType: 'event', resourceId: eventId, metadata: { channel: input.channel, destination: to, templateName: input.templateName, link } },
  });
  return { ok: true };
}
