export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { decryptSecret } from '@/lib/crypto/secrets';
import { PHONE_HINT, normalizePhone } from '@/lib/sms/phone';
import { FULL_ACCESS_KEY_HINT, checkResendFromDomain, getMessagingConfig, sendTenantEmail, sendTenantSms, type SendResult } from '@/lib/genie/messaging';

const Body = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('sms'), to: z.string().transform((v, ctx) => normalizePhone(v) ?? (ctx.addIssue({ code: 'custom', message: PHONE_HINT }), z.NEVER)) }),
  z.object({ channel: z.literal('email'), to: z.string().email('Enter a valid email address') }),
]);

// Sends a test message through the tenant's own provider and records the outcome
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  if (!checkRateLimit('genie-msg-test:' + auth.tenantId, 10, 600000).success) {
    return NextResponse.json({ ok: false, error: 'Too many test messages. Try again in a few minutes.' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { channel, to } = parsed.data;

  const config = await getMessagingConfig(auth.tenantId);
  const text = 'This is a test message from Genie (Booth Genius). Your ' + (channel === 'sms' ? 'text messages' : 'emails') + ' to guests are set up correctly.';
  let result: SendResult;
  if (channel === 'sms') {
    result = await sendTenantSms(config, to, text);
  } else {
    // Resend: check the From domain up front when the key allows listing domains
    const check = config?.emailProvider === 'resend' && config.resendApiKeyEnc && config.emailFromAddress
      ? await checkResendFromDomain(decryptSecret(config.resendApiKeyEnc), config.emailFromAddress)
      : { ok: true as const, checked: true };
    if (!check.ok) {
      result = { ok: false, error: check.error, retryable: false };
    } else {
      result = await sendTenantEmail(config, to, 'Genie test email', `<div style="font-family:sans-serif;padding:24px"><p>${text}</p></div>`, text);
      if (!result.ok && !check.checked) result = { ...result, error: `Resend said: ${result.error}. ${FULL_ACCESS_KEY_HINT}` };
    }
  }

  if (config) {
    await prisma.genieMessagingConfig.update({
      where: { id: config.id },
      data: channel === 'sms'
        ? { smsTestedAt: result.ok ? new Date() : null, smsTestError: result.ok ? null : result.error }
        : { emailTestedAt: result.ok ? new Date() : null, emailTestError: result.ok ? null : result.error },
    });
  }
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error }, { status: result.ok ? 200 : 422 });
}
