import { createHmac, timingSafeEqual } from 'crypto';

// Minimal Twilio REST client (Messages API) using the caller's own account credentials

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  messagingServiceSid?: string | null;
  fromNumber?: string | null;
};

export type TwilioSendResult = { ok: true; sid: string; status: string } | { ok: false; error: string; code?: number; retryable: boolean };

export async function sendTwilioSms(creds: TwilioCredentials, to: string, body: string, statusCallback?: string): Promise<TwilioSendResult> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (creds.messagingServiceSid) form.set('MessagingServiceSid', creds.messagingServiceSid);
  else if (creds.fromNumber) form.set('From', creds.fromNumber);
  else return { ok: false, error: 'No Messaging Service SID or From number configured', retryable: false };
  if (statusCallback) form.set('StatusCallback', statusCallback);

  let res: Response;
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error', retryable: true };
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 4xx are configuration/destination problems (bad credentials, unverified number); 429/5xx are worth retrying
    return { ok: false, error: json.message ?? `Twilio error ${res.status}`, code: json.code, retryable: res.status === 429 || res.status >= 500 };
  }
  return { ok: true, sid: json.sid, status: json.status };
}

// X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + each POST param name+value sorted by name))
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function validateTwilioSignature(authToken: string, signature: string | null, url: string, params: Record<string, string>): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
