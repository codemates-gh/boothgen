export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { decryptSecret } from '@/lib/crypto/secrets';
import { validateTwilioSignature } from '@/lib/sms/twilio';
import { PLATFORM_STATUS_CALLBACK_ID, getMessagingConfig, platformSms, twilioStatusCallbackUrl } from '@/lib/genie/messaging';
import { applyTwilioStatus } from '@/lib/genie/shares';

// Twilio message status callback for Genie SMS shares, signed with the tenant's own auth token, or BoothGen's own
// Twilio at /api/webhooks/twilio/genie/boothgen
export async function POST(req: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  const params = await props.params;
  const platform = params.tenantId === PLATFORM_STATUS_CALLBACK_ID;
  const authToken = platform ? platformSms()?.authToken : await getMessagingConfig(params.tenantId).then(c => c?.twilioAuthTokenEnc ? decryptSecret(c.twilioAuthTokenEnc) : null);
  if (!authToken) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const form = await req.formData();
  const fields: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === 'string') fields[k] = v; });

  // Twilio signs the exact URL it was given in StatusCallback
  const valid = validateTwilioSignature(authToken, req.headers.get('x-twilio-signature'), twilioStatusCallbackUrl(params.tenantId), fields);
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });

  if (fields.MessageSid && fields.MessageStatus) {
    await applyTwilioStatus(platform ? null : params.tenantId, fields.MessageSid, fields.MessageStatus, fields.ErrorCode);
  }
  return new NextResponse(null, { status: 204 });
}
