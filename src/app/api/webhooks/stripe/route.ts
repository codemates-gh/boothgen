export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { fmtCents } from '@/lib/utils';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma/client';
import { sendPaymentConfirmationEmail, sendHostNotificationEmail, sendEmail } from '@/lib/email/send';
import { triggerAutomation } from '@/lib/inngest/trigger';
import type Stripe from 'stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = headers().get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // Try both secrets — Destination 1 (payments) and Destination 2 (connect accounts)
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter(Boolean) as string[];

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch {}
  }

  if (!event) {
    console.error('[stripe-webhook] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { invoiceId, milestoneId } = pi.metadata;

        if (milestoneId) {
          const milestone = await prisma.paymentMilestone.update({
            where: { id: milestoneId },
            data: { status: 'PAID', paidAt: new Date(), stripePaymentIntentId: pi.id },
            include: { invoice: { include: { PaymentMilestone: true } } },
          });
          const updated = (milestone.invoice as any).PaymentMilestone.map((m: any) =>
            m.id === milestoneId ? { ...m, status: 'PAID' as const } : m
          );
          const paidCents    = updated.filter((m: any) => m.status === 'PAID').reduce((s: number, m: any) => s + m.amountCents, 0);
          const balanceCents = Math.max(0, milestone.invoice.totalCents - paidCents);
          await prisma.invoice.update({
            where: { id: milestone.invoiceId },
            data: {
              amountPaidCents: paidCents,
              balanceDueCents: balanceCents,
              status:  balanceCents <= 0 ? 'PAID' : 'PARTIALLY_PAID',
              paidAt:  balanceCents <= 0 ? new Date() : undefined,
            },
          });
          // Advance event to BOOKED once any payment is received
          if ((milestone.invoice as any).eventId) {
            await prisma.event.updateMany({
              where: { id: (milestone.invoice as any).eventId, status: { in: ['LEAD', 'QUOTED'] } },
              data: { status: 'BOOKED' },
            });
            await triggerAutomation({ tenantId: milestone.invoice.tenantId, eventId: (milestone.invoice as any).eventId, trigger: 'PAYMENT_RECEIVED' });
          }
        } else if (invoiceId) {
          const inv = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
              event: { include: { client: true } },
              tenant: {
                include: {
                  branding: { select: { companyName: true, replyToEmail: true } },
                  memberships: { where: { role: 'HOST_ADMIN' }, include: { user: { select: { email: true } } } },
                },
              },
            },
          });
          if (inv) {
            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status: 'PAID', paidAt: new Date(),
                amountPaidCents: inv.totalCents, balanceDueCents: 0,
                stripePaymentIntentId: pi.id,
              },
            });
            // Advance event to BOOKED on full payment
            if (inv.eventId) {
              await prisma.event.updateMany({
                where: { id: inv.eventId, status: { in: ['LEAD', 'QUOTED'] } },
                data: { status: 'BOOKED' },
              });
              await triggerAutomation({ tenantId: inv.tenantId, eventId: inv.eventId, trigger: 'PAYMENT_RECEIVED' });
            }
            if (inv.event?.client) {
              const fmt = (c: number) => fmtCents(c, inv.currency ?? 'usd');
              const companyName = inv.tenant.branding?.companyName ?? inv.tenant.name;
              const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
              // Skip hardcoded confirmation if an active automation rule covers PAYMENT_RECEIVED
              const hasPaymentRule = inv.eventId
                ? await prisma.automationRule.count({ where: { tenantId: inv.tenantId, trigger: 'PAYMENT_RECEIVED', isActive: true, actionType: 'EMAIL' } }) > 0
                : false;
              if (!hasPaymentRule) {
                sendPaymentConfirmationEmail({
                  to: inv.event.client.email,
                  firstName: inv.event.client.firstName,
                  companyName,
                  invoiceNumber: inv.invoiceNumber,
                  amountPaidFormatted: fmt(inv.totalCents),
                  eventTitle: inv.event.title,
                  portalUrl: APP_URL + '/portal/' + inv.event.portalToken + '?tab=invoice',
                  replyTo: inv.tenant.branding?.replyToEmail ?? undefined,
                  from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
                }).catch(e => console.error('[stripe-webhook] client confirmation email error:', e));
              }

              // Host notification always fires regardless of automation rules
              const hostEmails = (inv.tenant as any).memberships?.map((m: any) => m.user.email).filter(Boolean) ?? [];
              if (hostEmails.length > 0) {
                sendHostNotificationEmail({
                  to: hostEmails,
                  subject: `Payment received — ${inv.event.title}`,
                  heading: `Payment received for ${inv.event.title}`,
                  body: `<strong>${inv.event.client.firstName} ${inv.event.client.lastName}</strong> has paid invoice <strong>${inv.invoiceNumber}</strong> for <strong>${fmt(inv.totalCents)}</strong>. The invoice is now marked as paid.`,
                  ctaLabel: 'View Event',
                  ctaUrl: `${APP_URL}/events/${inv.eventId}`,
                }).catch(e => console.error('[stripe-webhook] host payment notification error:', e));
              }
            }
          }
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== 'founding_member') break;

        const tier        = parseInt(session.metadata.founding_tier ?? '1') || 1;
        const paymentEmail = session.metadata.founding_email ?? session.customer_details?.email ?? '';
        const name        = session.metadata.founding_name ?? '';
        const company     = session.metadata.founding_company ?? '';
        const paymentId   = typeof session.payment_intent === 'string' ? session.payment_intent : null;
        const amountCents = session.amount_total ?? 0;
        const setupToken  = crypto.randomUUID();
        const appUrl      = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';

        // Idempotent — skip if session already processed
        const existing = await prisma.foundingMember.findUnique({ where: { stripeSessionId: session.id } });
        if (existing) break;

        await prisma.foundingMember.create({
          data: {
            paymentEmail,
            name:           name || null,
            company:        company || null,
            tier,
            amountCents,
            stripeSessionId: session.id,
            stripePaymentId: paymentId,
            setupToken,
            status:         'PAID',
          },
        });

        const setupUrl = `${appUrl}/lifetime/setup?token=${setupToken}`;
        const firstName = name ? name.split(' ')[0] : 'there';

        sendEmail(
          paymentEmail,
          'You\'re a Founding Member — set up your Booth Genius account',
          `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center">
  <p style="font-size:28px;margin:0 0 8px">🎉</p>
  <h2 style="font-size:22px;color:#111827;margin:0 0 6px;font-weight:800">Welcome to Booth Genius, ${firstName}!</h2>
  <p style="color:#6b7280;font-size:14px;margin:0">You're officially a Founding Member.</p>
</div>

<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Your payment went through — zero monthly fees, zero commission cuts, full Pro access, forever. This is the best deal Booth Genius will ever offer, and you locked it in.</p>

<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">Click the button below to create your Booth Genius account. You can use any email and any name — it doesn't need to match what you paid with.</p>

<p style="text-align:center;margin:0 0 24px">
  <a href="${setupUrl}" style="background:#f97316;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
    Set Up My Account →
  </a>
</p>

<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:0 0 24px">
  <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">What you have access to</p>
  <ul style="margin:0;padding:0 0 0 16px;color:#374151;font-size:14px;line-height:1.8">
    <li>Full Pro features — leads, quotes, contracts, invoices</li>
    <li>Post-event photo gallery with client access codes</li>
    <li>Automated follow-up emails</li>
    <li>Stripe payment processing for your clients</li>
    <li>Founding Member badge in your account</li>
    <li>Direct line to me — reply to this email anytime</li>
  </ul>
</div>

<p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 24px">
  <strong>This setup link is for you only.</strong> If you have any trouble, just reply to this email — I'll help you directly.<br><br>
  — Geoffrey<br>Founder, Booth Genius
</p>

<div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">
  <p style="color:#9ca3af;font-size:11px;margin:0">Questions? Reply to this email, visit <a href="${appUrl}/support" style="color:#f97316">${appUrl}/support</a>, or join the member community at <a href="https://www.facebook.com/groups/boothgenius" style="color:#f97316">facebook.com/groups/boothgenius</a></p>
</div>
</div>`,
        ).catch(e => console.error('[stripe-webhook] founding setup email error:', e));

        // Notify super admin
        const notifyEmail = process.env.SUPER_ADMIN_NOTIFY_EMAIL;
        if (notifyEmail) {
          sendEmail(
            notifyEmail,
            `New Founding Member — Round ${tier} — ${name || paymentEmail}`,
            `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:20px;color:#111827;margin:0 0 16px">New Founding Member Payment</h2>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:0 0 24px">
  <p style="margin:0 0 6px;font-weight:700;color:#111827;font-size:16px">${name || '(Name not provided)'}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Email: ${paymentEmail}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Company: ${company || '—'}</p>
  <p style="margin:0 0 4px;color:#374151;font-size:14px;">Round: ${tier} · Amount: $${amountCents / 100}</p>
</div>
<p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px">Booth Genius internal notification</p>
</div>`,
          ).catch(e => console.error('[stripe-webhook] founding admin notify error:', e));
        }
        break;
      }

      case 'account.updated': {
        const acct = event.data.object as Stripe.Account;
        await prisma.stripeConnectAccount.updateMany({
          where: { stripeAccountId: acct.id },
          data: {
            onboardingStatus: acct.charges_enabled ? 'ACTIVE' : 'ONBOARDING_INITIATED',
            chargesEnabled:   acct.charges_enabled,
            payoutsEnabled:   acct.payouts_enabled,
            detailsSubmitted: acct.details_submitted,
          },
        });
        break;
      }

    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
