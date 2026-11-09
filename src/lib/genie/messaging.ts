import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import type { GenieMessagingConfig } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { decryptSecret } from '@/lib/crypto/secrets';
import { sendTwilioSms } from '@/lib/sms/twilio';
import { appUrl } from './urls';

// Genie guest shares go only through the tenant's own providers. Platform email (src/lib/email/send.ts) is not used here.

export type SendResult = { ok: true; providerMessageId?: string } | { ok: false; error: string; retryable: boolean };

export function smsConfigured(c: GenieMessagingConfig | null): boolean {
  return !!(c?.twilioAccountSid && c.twilioAuthTokenEnc && (c.twilioMessagingServiceSid || c.twilioFromNumber));
}

export function emailConfigured(c: GenieMessagingConfig | null): boolean {
  if (!c?.emailFromAddress) return false;
  if (c.emailProvider === 'resend') return !!c.resendApiKeyEnc;
  if (c.emailProvider === 'smtp') return !!(c.smtpHost && c.smtpPort);
  return false;
}

export async function getMessagingConfig(tenantId: string) {
  return prisma.genieMessagingConfig.findUnique({ where: { tenantId } });
}

export function twilioStatusCallbackUrl(tenantId: string): string {
  return `${appUrl()}/api/webhooks/twilio/genie/${tenantId}`;
}

export async function sendTenantSms(c: GenieMessagingConfig | null, to: string, body: string): Promise<SendResult> {
  if (!c || !smsConfigured(c)) return { ok: false, error: 'SMS is not set up', retryable: false };
  const result = await sendTwilioSms(
    { accountSid: c.twilioAccountSid!, authToken: decryptSecret(c.twilioAuthTokenEnc!), messagingServiceSid: c.twilioMessagingServiceSid, fromNumber: c.twilioFromNumber },
    to, body, twilioStatusCallbackUrl(c.tenantId),
  );
  return result.ok ? { ok: true, providerMessageId: result.sid } : { ok: false, error: result.error, retryable: result.retryable };
}

function fromHeader(c: GenieMessagingConfig): string {
  return c.emailFromName ? `${c.emailFromName.replace(/[<>"]/g, '')} <${c.emailFromAddress}>` : c.emailFromAddress!;
}

export async function sendTenantEmail(c: GenieMessagingConfig | null, to: string, subject: string, html: string, text: string): Promise<SendResult> {
  if (!c || !emailConfigured(c)) return { ok: false, error: 'Email is not set up', retryable: false };
  try {
    if (c.emailProvider === 'resend') {
      const resend = new Resend(decryptSecret(c.resendApiKeyEnc!));
      const { data, error } = await resend.emails.send({ from: fromHeader(c), to, subject, html, text });
      if (error) return { ok: false, error: error.message, retryable: error.name === 'rate_limit_exceeded' || error.name === 'internal_server_error' };
      return { ok: true, providerMessageId: data?.id };
    }
    const transport = nodemailer.createTransport({
      host: c.smtpHost!,
      port: c.smtpPort!,
      secure: c.smtpSecurity === 'tls',
      requireTLS: c.smtpSecurity === 'starttls',
      ignoreTLS: c.smtpSecurity === 'none',
      auth: c.smtpUsername ? { user: c.smtpUsername, pass: c.smtpPasswordEnc ? decryptSecret(c.smtpPasswordEnc) : '' } : undefined,
      connectionTimeout: 15000,
    });
    const info = await transport.sendMail({ from: fromHeader(c), to, subject, html, text });
    return { ok: true, providerMessageId: info.messageId };
  } catch (err: any) {
    // SMTP 5xx responses and auth failures won't fix themselves; connection errors might
    const permanent = (typeof err?.responseCode === 'number' && err.responseCode >= 500) || err?.code === 'EAUTH';
    return { ok: false, error: err?.message ?? 'Email send failed', retryable: !permanent };
  }
}
