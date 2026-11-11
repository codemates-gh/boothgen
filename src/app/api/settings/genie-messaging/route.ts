export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { GenieMessagingConfig, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/crypto/secrets';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { normalizePhone } from '@/lib/sms/phone';
import { FULL_ACCESS_KEY_HINT, checkResendFromDomain, emailConfigured, platformDomainError, smsConfigured } from '@/lib/genie/messaging';

const opt = (s: z.ZodString) => s.optional().or(z.literal('')).transform(v => v || null);

const SmsInput = z.object({
  accountSid: z.string().regex(/^AC[0-9a-fA-F]{32}$/, 'Account SID starts with AC followed by 32 characters'),
  authToken: z.string().optional(), // blank keeps the saved token
  messagingServiceSid: opt(z.string().regex(/^MG[0-9a-fA-F]{32}$/, 'Messaging Service SID starts with MG followed by 32 characters')),
  fromNumber: z.string().optional().transform((v, ctx) => !v?.trim() ? null : normalizePhone(v) ?? (ctx.addIssue({ code: 'custom', message: 'Enter the From number as 240-555-0123 or +12405550123' }), z.NEVER)),
});

const EmailInput = z.object({
  provider: z.enum(['resend', 'smtp']),
  fromName: opt(z.string().max(80)),
  fromAddress: z.string().email('Enter a valid from address'),
  resendApiKey: z.string().optional(),
  smtpHost: opt(z.string().max(255)),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']).optional().nullable(),
  smtpUsername: opt(z.string().max(255)),
  smtpPassword: z.string().optional(), // blank keeps the saved password
});

const Body = z.object({ sms: SmsInput.nullable().optional(), email: EmailInput.nullable().optional() });

function masked(enc: string | null) {
  if (!enc) return null;
  try { return maskSecret(decryptSecret(enc)); } catch { return '••••••••'; }
}

// Never returns secrets, only masked values
function view(c: GenieMessagingConfig | null) {
  return {
    sms: {
      configured: smsConfigured(c),
      accountSid: c?.twilioAccountSid ?? '',
      authTokenMasked: masked(c?.twilioAuthTokenEnc ?? null),
      messagingServiceSid: c?.twilioMessagingServiceSid ?? '',
      fromNumber: c?.twilioFromNumber ?? '',
      testedAt: c?.smsTestedAt ?? null,
      testError: c?.smsTestError ?? null,
    },
    email: {
      configured: emailConfigured(c),
      provider: c?.emailProvider ?? null,
      fromName: c?.emailFromName ?? '',
      fromAddress: c?.emailFromAddress ?? '',
      resendApiKeyMasked: masked(c?.resendApiKeyEnc ?? null),
      smtpHost: c?.smtpHost ?? '',
      smtpPort: c?.smtpPort ?? null,
      smtpSecurity: c?.smtpSecurity ?? 'starttls',
      smtpUsername: c?.smtpUsername ?? '',
      smtpPasswordMasked: masked(c?.smtpPasswordEnc ?? null),
      testedAt: c?.emailTestedAt ?? null,
      testError: c?.emailTestError ?? null,
      // A From address saved before the own-domain rule: shown as a problem instead of "Tested"
      domainError: c?.emailFromAddress ? platformDomainError(c.emailFromAddress) : null,
    },
  };
}

export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(view(await prisma.genieMessagingConfig.findUnique({ where: { tenantId: auth.tenantId } })));
}

export async function PUT(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { sms, email } = parsed.data;
  const existing = await prisma.genieMessagingConfig.findUnique({ where: { tenantId: auth.tenantId } });

  const data: Prisma.GenieMessagingConfigUncheckedUpdateInput = {};
  let notice: string | null = null;
  if (sms === null) {
    Object.assign(data, { twilioAccountSid: null, twilioAuthTokenEnc: null, twilioMessagingServiceSid: null, twilioFromNumber: null, smsTestedAt: null, smsTestError: null });
  } else if (sms) {
    if (!sms.messagingServiceSid && !sms.fromNumber) return NextResponse.json({ error: 'Enter a Messaging Service SID or a From number' }, { status: 400 });
    if (!sms.authToken && !existing?.twilioAuthTokenEnc) return NextResponse.json({ error: 'Enter the Twilio Auth Token' }, { status: 400 });
    Object.assign(data, {
      twilioAccountSid: sms.accountSid,
      twilioMessagingServiceSid: sms.messagingServiceSid,
      twilioFromNumber: sms.fromNumber,
      ...(sms.authToken ? { twilioAuthTokenEnc: encryptSecret(sms.authToken.trim()) } : {}),
      smsTestedAt: null, smsTestError: null,
    });
  }
  if (email === null) {
    Object.assign(data, { emailProvider: null, emailFromName: null, emailFromAddress: null, resendApiKeyEnc: null, smtpHost: null, smtpPort: null, smtpSecurity: null, smtpUsername: null, smtpPasswordEnc: null, emailTestedAt: null, emailTestError: null });
  } else if (email) {
    if (email.provider === 'resend' && !email.resendApiKey && !existing?.resendApiKeyEnc) return NextResponse.json({ error: 'Enter the Resend API key' }, { status: 400 });
    if (email.provider === 'smtp' && (!email.smtpHost || !email.smtpPort)) return NextResponse.json({ error: 'Enter the SMTP host and port' }, { status: 400 });
    const blocked = platformDomainError(email.fromAddress);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
    if (email.provider === 'resend') {
      const key = email.resendApiKey?.trim() || decryptSecret(existing!.resendApiKeyEnc!);
      const check = await checkResendFromDomain(key, email.fromAddress);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      if (!check.checked) notice = "Saved. Your Resend key can't list domains, so the From domain wasn't checked. Use Send test to confirm it works. " + FULL_ACCESS_KEY_HINT;
    }
    Object.assign(data, {
      emailProvider: email.provider,
      emailFromName: email.fromName,
      emailFromAddress: email.fromAddress,
      ...(email.resendApiKey ? { resendApiKeyEnc: encryptSecret(email.resendApiKey.trim()) } : {}),
      smtpHost: email.smtpHost,
      smtpPort: email.smtpPort ?? null,
      smtpSecurity: email.smtpSecurity ?? null,
      smtpUsername: email.smtpUsername,
      ...(email.smtpPassword ? { smtpPasswordEnc: encryptSecret(email.smtpPassword) } : {}),
      emailTestedAt: null, emailTestError: null,
    });
  }

  const saved = await prisma.genieMessagingConfig.upsert({
    where: { tenantId: auth.tenantId },
    create: { ...(data as Prisma.GenieMessagingConfigUncheckedCreateInput), tenantId: auth.tenantId },
    update: data,
  });
  return NextResponse.json({ ...view(saved), notice });
}
