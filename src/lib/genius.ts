import { NextResponse } from 'next/server';
import type { StripeSubscription } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

// Stage 4 (G, 2026-11-15): Genius, the CRM, needs Genius Pro. The free commission plan is gone. An account without
// Pro (or a lifetime/founding plan, an unexpired trial, or Super Admin's "Keep Genius free") becomes Genie only right
// away: CRM activity stops (automations, client portal, quote/contract/invoice actions, lead capture), nothing is
// deleted, and subscribing to Pro brings the CRM back. Off until Super Admin turns the rule on (system setting).
// Plan: docs/genie/genie-only-plan.md

export const RULE_SETTING = 'genius_requires_pro';

export async function ruleOn(): Promise<boolean> {
  return (await prisma.systemSetting.findUnique({ where: { key: RULE_SETTING } }))?.value === 'on';
}

type TenantForGenius = { product: string; status: string; trialEndsAt: Date | null; geniusFree: boolean; stripeSubscription: Pick<StripeSubscription, 'plan' | 'status'> | null };

// Why the account keeps Genius, or null when it doesn't
export function geniusReason(t: TenantForGenius, now = new Date()): 'free' | 'lifetime' | 'pro' | 'trial' | null {
  if (t.geniusFree) return 'free';
  const sub = t.stripeSubscription;
  if (sub?.plan === 'LIFETIME') return 'lifetime';
  if ((sub?.plan === 'MONTHLY' || sub?.plan === 'ANNUAL') && ['ACTIVE', 'PAST_DUE', 'TRIALING'].includes(sub.status)) return 'pro';
  if (t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt > now) return 'trial';
  return null;
}

const select = { id: true, name: true, product: true, status: true, trialEndsAt: true, geniusFree: true, stripeSubscription: { select: { plan: true, status: true } } } as const;

// Genius accounts that would become Genie only under the rule (for Super Admin's preview and the daily check)
export async function accountsLosingGenius(now = new Date()) {
  const crm = await prisma.tenant.findMany({ where: { product: 'crm', status: { not: 'CANCELLED' } }, select });
  return crm.filter(t => !geniusReason(t, now));
}

// What stops, for the email
async function openCrmWork(tenantId: string) {
  const [invoices, contracts, automations] = await Promise.all([
    prisma.invoice.count({ where: { tenantId, status: { notIn: ['PAID', 'CANCELLED', 'DRAFT'] } } }),
    prisma.contract.count({ where: { tenantId, status: 'SENT_TO_CLIENT' } }),
    prisma.automationExecution.count({ where: { tenantId, status: 'SCHEDULED' } }),
  ]);
  return { invoices, contracts, automations };
}

// Switches one account to Genie only and tells the owner. Keeps every record.
export async function switchToGenieOnly(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ...select, genieEnabledAt: true } });
  if (!t || t.product === 'genie') return false;
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { product: 'genie', genieEnabled: true, ...(t.genieEnabledAt ? {} : { genieEnabledAt: new Date() }) },
  });
  // Scheduled automation emails won't go out (the runner skips Genie-only accounts); mark them so the history says why
  await prisma.automationExecution.updateMany({ where: { tenantId, status: 'SCHEDULED' }, data: { status: 'SKIPPED', errorMessage: 'Account moved to Genie (Genius needs Pro)' } });
  await notifyOwner(t.id, t.name).catch(e => console.error('[genius] switch email failed:', e));
  return true;
}

async function notifyOwner(tenantId: string, name: string) {
  const [owner, work] = await Promise.all([
    prisma.tenantMembership.findFirst({ where: { tenantId, role: 'HOST_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { user: { select: { email: true, name: true } } } }),
    openCrmWork(tenantId),
  ]);
  if (!owner) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  const lines = [
    work.invoices ? `${work.invoices} open invoice${work.invoices === 1 ? '' : 's'}: clients can no longer pay through BoothGen` : null,
    work.contracts ? `${work.contracts} contract${work.contracts === 1 ? '' : 's'} waiting for a signature` : null,
    work.automations ? `${work.automations} scheduled automation email${work.automations === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  await sendEmail(owner.user.email, `${name} is now on Genie`, `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#374151">
  <h2 style="font-size:20px;color:#111827">Your account is now on Genie</h2>
  <p>Genius, the photo booth CRM, now needs Genius Pro, so <strong>${name.replace(/[<>&"]/g, '')}</strong> has moved to Genie, the photo booth app. Your booth events, layouts, galleries and Genie setup work as before, at $15 per event.</p>
  <p>The CRM is paused. Nothing was deleted: leads, clients, quotes, contracts and invoices are kept.${lines.length ? ' What stopped:' : ''}</p>
  ${lines.length ? '<ul>' + lines.map(l => `<li>${l}</li>`).join('') + '</ul>' : ''}
  <p>Clients who open an old portal link see that it's no longer available and are asked to contact you.</p>
  <p style="margin:28px 0"><a href="${appUrl}/upgrade" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Bring the CRM back with Genius Pro</a></p>
  <p style="color:#6b7280;font-size:13px">Subscribing brings everything back right away. Questions? Reply to this email.</p>
</div>`);
}

// Daily check and after Stripe changes: switch every account that lost Genius, when the rule is on
export async function enforceGenius(): Promise<number> {
  if (!await ruleOn()) return 0;
  let n = 0;
  for (const t of await accountsLosingGenius()) if (await switchToGenieOnly(t.id)) n++;
  return n;
}

// One account, after its subscription changed (webhook)
export async function enforceGeniusFor(tenantId: string): Promise<boolean> {
  if (!await ruleOn()) return false;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select });
  if (!t || t.product !== 'crm' || t.status === 'CANCELLED' || geniusReason(t)) return false;
  return switchToGenieOnly(tenantId);
}

// Subscribing to Pro (or lifetime) from a Genie-only account brings the CRM back
export async function restoreGeniusIfPaid(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select });
  if (!t || t.product !== 'genie') return false;
  const r = geniusReason(t);
  if (r !== 'pro' && r !== 'lifetime') return false;
  await prisma.tenant.update({ where: { id: tenantId }, data: { product: 'crm' } });
  return true;
}

// Client-facing CRM routes (portal, quote and contract actions, invoice payments, lead capture) answer this for
// Genie-only accounts
export function geniusEnded(companyName: string) {
  return NextResponse.json({ error: `This is no longer available. Please contact ${companyName}.`, code: 'no_longer_available', companyName }, { status: 410 });
}

// For client-facing CRM routes: the 410 answer when the account is Genie only, else null
export async function closedForClients(tenantId: string): Promise<NextResponse | null> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, product: true, branding: { select: { companyName: true } } } });
  return t?.product === 'genie' ? geniusEnded(t.branding?.companyName || t.name) : null;
}
