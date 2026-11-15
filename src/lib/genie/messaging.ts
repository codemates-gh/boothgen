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

// Set up and allowed to send: a From address on the platform's domain (saved before that rule) can't send
export function emailUsable(c: GenieMessagingConfig | null): boolean {
  return emailConfigured(c) && !platformDomainError(c!.emailFromAddress!);
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

// Tenants send guest email from their own domain, never the platform's
const PLATFORM_EMAIL_DOMAINS = ['boothgen.com'];

export const FULL_ACCESS_KEY_HINT = 'Tip: use a Resend API key with full access to have the From domain checked when you save.';

export function emailDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).trim().toLowerCase().replace(/\.$/, '');
}

export function platformDomainError(address: string): string | null {
  const domain = emailDomain(address);
  const blocked = PLATFORM_EMAIL_DOMAINS.find(d => domain === d || domain.endsWith('.' + d));
  return blocked ? `You can't send from ${domain}. Use an address on your own domain.` : null;
}

export type DomainCheck = { ok: true; checked: boolean } | { ok: false; error: string };

// Asks Resend (with the tenant's key) whether the From domain is verified. Sending-only keys can't
// list domains (401/403): the check is skipped and Send test reports Resend's own error instead.
export async function checkResendFromDomain(apiKey: string, address: string): Promise<DomainCheck> {
  const domain = emailDomain(address);
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' });
  } catch {
    return { ok: true, checked: false };
  }
  if (res.status === 401 || res.status === 403) return { ok: true, checked: false };
  if (!res.ok) return { ok: true, checked: false };
  const body = await res.json().catch(() => null) as { data?: { name?: string; status?: string }[] } | null;
  if (!Array.isArray(body?.data)) return { ok: true, checked: false };
  const match = body.data.find(d => d.name?.toLowerCase() === domain);
  if (match?.status === 'verified') return { ok: true, checked: true };
  return {
    ok: false,
    error: match
      ? `${domain} isn't verified in your Resend account yet (status: ${match.status ?? 'unknown'}). Finish verifying it under Resend → Domains, or use an address on a verified domain.`
      : `${domain} isn't verified in your Resend account. Add it under Resend → Domains, or use an address on a verified domain.`,
  };
}

function fromHeader(c: GenieMessagingConfig): string {
  return c.emailFromName ? `${c.emailFromName.replace(/[<>"]/g, '')} <${c.emailFromAddress}>` : c.emailFromAddress!;
}

export async function sendTenantEmail(c: GenieMessagingConfig | null, to: string, subject: string, html: string, text: string): Promise<SendResult> {
  if (!c || !emailConfigured(c)) return { ok: false, error: 'Email is not set up', retryable: false };
  const blocked = platformDomainError(c.emailFromAddress!);
  if (blocked) return { ok: false, error: blocked, retryable: false };
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

// ── BoothGen texting and email (Genie-only stage 2c) ────────────────────────
// Genie-only accounts can send guest texts and emails through BoothGen's own Twilio (a toll-free number on a
// "BoothGen platform" subaccount) and Resend (a sending domain just for this), included in the event price.
// Operators who connected their own accounts keep using them. Credentials come from these environment variables:
//   BOOTHGEN_TWILIO_ACCOUNT_SID, BOOTHGEN_TWILIO_AUTH_TOKEN,
//   BOOTHGEN_TWILIO_MESSAGING_SERVICE_SID (or BOOTHGEN_TWILIO_FROM_NUMBER),
//   BOOTHGEN_RESEND_API_KEY, BOOTHGEN_EMAIL_FROM (e.g. photos@mail.boothgen.com)
// STOP/HELP: Twilio's opt-out handling on the Messaging Service replies and blocks texts to that guest.

export type Source = 'own' | 'boothgen';
export type MessagingRoutes = { sms: Source | null; email: Source | null };

// Safety limit on BoothGen texts per event, only to stop a bug or abuse (G: the real cap comes after usage data)
export const BOOTHGEN_SMS_LIMIT_PER_EVENT = 2000;

export function platformSms() {
  const accountSid = process.env.BOOTHGEN_TWILIO_ACCOUNT_SID, authToken = process.env.BOOTHGEN_TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.BOOTHGEN_TWILIO_MESSAGING_SERVICE_SID || null, fromNumber = process.env.BOOTHGEN_TWILIO_FROM_NUMBER || null;
  return accountSid && authToken && (messagingServiceSid || fromNumber) ? { accountSid, authToken, messagingServiceSid, fromNumber } : null;
}

export function platformEmail() {
  const apiKey = process.env.BOOTHGEN_RESEND_API_KEY, from = process.env.BOOTHGEN_EMAIL_FROM;
  return apiKey && from ? { apiKey, from } : null;
}

// Who can use BoothGen's accounts: Genie-only accounts (texts and email are in the per-event price)
export const canUseBoothGen = (tenant: { product: string }) => tenant.product === 'genie';

export function messagingRoutes(c: GenieMessagingConfig | null, tenant: { product: string }): MessagingRoutes {
  const allowed = canUseBoothGen(tenant);
  const pick = (source: string | null | undefined, ownReady: boolean, platformReady: boolean): Source | null => {
    const boothgen = allowed && platformReady;
    if (source === 'own') return ownReady ? 'own' : null;
    if (source === 'boothgen') return boothgen ? 'boothgen' : null;
    return ownReady ? 'own' : boothgen ? 'boothgen' : null;
  };
  return {
    sms: pick(c?.smsSource, smsConfigured(c), !!platformSms()),
    email: pick(c?.emailSource, emailUsable(c), !!platformEmail()),
  };
}

export type Messaging = { config: GenieMessagingConfig | null; tenant: { id: string; name: string; product: string }; routes: MessagingRoutes };

export async function getMessaging(tenantId: string): Promise<Messaging> {
  const [config, tenant] = await Promise.all([
    getMessagingConfig(tenantId),
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, product: true } }),
  ]);
  return { config, tenant, routes: messagingRoutes(config, tenant) };
}

export const PLATFORM_STATUS_CALLBACK_ID = 'boothgen';

export async function sendSms(m: Messaging, to: string, body: string): Promise<SendResult & { provider?: Source }> {
  if (m.routes.sms === 'own') return { ...await sendTenantSms(m.config, to, body), provider: 'own' };
  const p = m.routes.sms === 'boothgen' ? platformSms() : null;
  if (!p) return { ok: false, error: 'SMS is not set up', retryable: false };
  const r = await sendTwilioSms(p, to, body, twilioStatusCallbackUrl(PLATFORM_STATUS_CALLBACK_ID));
  // 21610: the guest replied STOP to BoothGen's number
  if (!r.ok) return { ok: false, error: r.code === 21610 ? 'This number opted out of texts (replied STOP)' : r.error, retryable: r.retryable, provider: 'boothgen' };
  return { ok: true, providerMessageId: r.sid, provider: 'boothgen' };
}

// The operator's business name and reply-to address, for email sent from BoothGen's domain
async function senderIdentity(tenantId: string, fallbackName: string) {
  const [branding, admin] = await Promise.all([
    prisma.tenantBranding.findUnique({ where: { tenantId }, select: { companyName: true, replyToEmail: true } }),
    prisma.tenantMembership.findFirst({ where: { tenantId, role: 'HOST_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { user: { select: { email: true } } } }),
  ]);
  return { name: branding?.companyName || fallbackName, replyTo: branding?.replyToEmail || admin?.user.email || null };
}

export async function sendEmail(m: Messaging, to: string, subject: string, html: string, text: string): Promise<SendResult & { provider?: Source }> {
  if (m.routes.email === 'own') return { ...await sendTenantEmail(m.config, to, subject, html, text), provider: 'own' };
  const p = m.routes.email === 'boothgen' ? platformEmail() : null;
  if (!p) return { ok: false, error: 'Email is not set up', retryable: false };
  const who = await senderIdentity(m.tenant.id, m.tenant.name);
  try {
    const resend = new Resend(p.apiKey);
    const { data, error } = await resend.emails.send({
      from: `${who.name.replace(/[<>"]/g, '')} via Booth Genius <${p.from}>`, to, subject, html, text,
      ...(who.replyTo ? { reply_to: who.replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message, retryable: error.name === 'rate_limit_exceeded' || error.name === 'internal_server_error', provider: 'boothgen' };
    return { ok: true, providerMessageId: data?.id, provider: 'boothgen' };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Email send failed', retryable: true, provider: 'boothgen' };
  }
}
