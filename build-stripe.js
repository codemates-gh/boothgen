#!/usr/bin/env node
// BoothGen — Stripe Connect build script
// Run from: /Users/gnolasco/Desktop/BoothGen
// Creates 6 new files and rewrites the client portal with live payments.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function w(fp, content) {
  const full = path.join(ROOT, fp);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('  ✓  ' + fp);
}

console.log('\n🔌  BoothGen — Stripe Connect\n');

// ─── 1. Shared Stripe client ──────────────────────────────────────────────────
w('src/lib/stripe.ts',
`import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10',
  typescript: true,
});

export const PLATFORM_FEE_PERCENT = parseFloat(
  process.env.STRIPE_PLATFORM_FEE_PERCENT ?? '2'
);

/** Returns the application_fee_amount for a payment (in cents). */
export function applicationFee(amountCents: number): number {
  return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
}
`);

// ─── 2. Connect callback (host returns from Stripe onboarding) ────────────────
w('src/app/api/stripe/connect/callback/route.ts',
`export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const connect = await prisma.stripeConnectAccount.findUnique({
    where: { tenantId: session.tenantId },
  });

  if (connect?.stripeAccountId) {
    const acct = await stripe.accounts.retrieve(connect.stripeAccountId);
    await prisma.stripeConnectAccount.update({
      where: { tenantId: session.tenantId },
      data: {
        onboardingStatus: acct.charges_enabled ? 'ACTIVE' : 'ONBOARDING_INITIATED',
        chargesEnabled:   acct.charges_enabled,
        payoutsEnabled:   acct.payouts_enabled,
        detailsSubmitted: acct.details_submitted,
        email:   acct.email   ?? undefined,
        country: acct.country ?? undefined,
        livemode: acct.livemode,
      },
    });
  }

  const base   = process.env.NEXT_PUBLIC_APP_URL ?? req.url;
  const status = connect?.onboardingStatus === 'ACTIVE' ? 'connected' : 'pending';
  return NextResponse.redirect(new URL('/settings/billing?stripe=' + status, base));
}
`);

// ─── 3. Connect dashboard (host opens their Stripe Express dashboard) ─────────
w('src/app/api/stripe/connect/dashboard/route.ts',
`export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connect = await prisma.stripeConnectAccount.findUnique({
    where: { tenantId: session.tenantId },
  });

  if (!connect?.stripeAccountId) {
    // Not connected yet — kick off onboarding
    return NextResponse.redirect(
      new URL('/api/stripe/connect/authorize', req.url)
    );
  }

  const loginLink = await stripe.accounts.createLoginLink(
    connect.stripeAccountId
  );
  return NextResponse.redirect(loginLink.url);
}
`);

// ─── 4. Webhook — /api/webhooks/stripe (already in middleware PUBLIC list) ────
w('src/app/api/webhooks/stripe/route.ts',
`export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma/client';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = headers().get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[stripe-webhook] sig error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Invoice or milestone payment succeeded ──────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { invoiceId, milestoneId } = pi.metadata;

        if (milestoneId) {
          // Mark milestone paid and recalculate invoice totals
          const milestone = await prisma.paymentMilestone.update({
            where: { id: milestoneId },
            data: {
              status:                'PAID',
              paidAt:                new Date(),
              stripePaymentIntentId: pi.id,
            },
            include: { invoice: { include: { milestones: true } } },
          });

          const updated = milestone.invoice.milestones.map(m =>
            m.id === milestoneId ? { ...m, status: 'PAID' as const } : m
          );
          const paidCents   = updated.filter(m => m.status === 'PAID').reduce((s, m) => s + m.amountCents, 0);
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

        } else if (invoiceId) {
          // Full invoice payment
          const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
          if (inv) {
            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status:                'PAID',
                paidAt:                new Date(),
                amountPaidCents:       inv.totalCents,
                balanceDueCents:       0,
                stripePaymentIntentId: pi.id,
              },
            });
          }
        }
        break;
      }

      // ── Host account updated (fires when onboarding completes) ──────────────
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
`);

// ─── 5. Payment intent — /api/public/stripe/payment-intent ───────────────────
//        Called from the portal (no auth needed — it's public)
w('src/app/api/public/stripe/payment-intent/route.ts',
`export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { stripe, applicationFee } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const { invoiceId, milestoneId } = await req.json();
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where:   { id: invoiceId },
    include: {
      tenant:     { include: { stripeConnect: true } },
      milestones: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  if (invoice.status === 'PAID') {
    return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
  }

  const connect = invoice.tenant.stripeConnect;
  if (!connect?.stripeAccountId || connect.onboardingStatus !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'This host has not completed their payment setup yet.' },
      { status: 400 }
    );
  }

  let amountCents: number;
  const meta: Record<string, string> = {
    invoiceId: invoice.id,
    tenantId:  invoice.tenantId,
  };

  if (milestoneId) {
    const ms = invoice.milestones.find(m => m.id === milestoneId);
    if (!ms) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    if (ms.status === 'PAID') {
      return NextResponse.json({ error: 'Milestone already paid' }, { status: 400 });
    }
    amountCents       = ms.amountCents;
    meta.milestoneId  = milestoneId;

    // Reuse existing PaymentIntent if still usable
    if (ms.stripePaymentIntentId) {
      try {
        const ex = await stripe.paymentIntents.retrieve(ms.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(ex.status)) {
          return NextResponse.json({ clientSecret: ex.client_secret });
        }
      } catch { /* stale PI — create a new one */ }
    }
  } else {
    amountCents = invoice.balanceDueCents;
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'No balance due' }, { status: 400 });
    }

    // Reuse existing PaymentIntent if still usable
    if (invoice.stripePaymentIntentId) {
      try {
        const ex = await stripe.paymentIntents.retrieve(invoice.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(ex.status)) {
          return NextResponse.json({ clientSecret: ex.client_secret });
        }
      } catch { /* stale PI — create a new one */ }
    }
  }

  const fee = applicationFee(amountCents);

  const pi = await stripe.paymentIntents.create({
    amount:                  amountCents,
    currency:                invoice.currency ?? 'usd',
    application_fee_amount:  fee,
    transfer_data:           { destination: connect.stripeAccountId },
    metadata:                meta,
    description:             'Invoice ' + invoice.invoiceNumber +
                               (milestoneId ? ' – milestone payment' : ''),
  });

  // Persist PI id for idempotency
  if (milestoneId) {
    await prisma.paymentMilestone.update({
      where: { id: milestoneId },
      data:  { stripePaymentIntentId: pi.id },
    });
  } else {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data:  { stripePaymentIntentId: pi.id },
    });
  }

  return NextResponse.json({ clientSecret: pi.client_secret });
}
`);

// ─── 6. InvoicePaymentForm component ─────────────────────────────────────────
w('src/components/stripe/PaymentForm.tsx',
`'use client';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
);

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

function Checkout({
  amountCents,
  brandColor,
  returnUrl,
}: {
  amountCents: number;
  brandColor: string;
  returnUrl: string;
}) {
  const stripe     = useStripe();
  const elements   = useElements();
  const [err, setErr]           = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      setErr(error.message ?? 'Payment failed. Please try again.');
      setBusy(false);
    }
    // Success → Stripe redirects to returnUrl automatically
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {err}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ backgroundColor: brandColor }}
      >
        {busy
          ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
          : <><Lock className="w-4 h-4" />Pay {fmt(amountCents)}</>}
      </button>
      <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Secured by Stripe
      </p>
    </form>
  );
}

export function InvoicePaymentForm({
  invoiceId,
  milestoneId,
  amountCents,
  brandColor,
  returnUrl,
}: {
  invoiceId:   string;
  milestoneId?: string;
  amountCents: number;
  brandColor:  string;
  returnUrl:   string;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchErr,     setFetchErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/stripe/payment-intent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ invoiceId, milestoneId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setFetchErr(d.error);
        else         setClientSecret(d.clientSecret);
      })
      .catch(() => setFetchErr('Could not initialise payment form.'));
  }, [invoiceId, milestoneId]);

  if (fetchErr) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
      {fetchErr}
    </div>
  );

  if (!clientSecret) return (
    <div className="flex justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: brandColor },
        },
      }}
    >
      <Checkout
        amountCents={amountCents}
        brandColor={brandColor}
        returnUrl={returnUrl}
      />
    </Elements>
  );
}
`);

// ─── 7. Updated portal page — wire up Pay Now button ─────────────────────────
w('src/app/portal/[portalToken]/page.tsx',
`'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Camera, CheckCircle2, Lock, FileText, Receipt, Image, ChevronRight, Printer } from 'lucide-react';
import { InvoicePaymentForm } from '@/components/stripe/PaymentForm';

type Tab = 'quote' | 'contract' | 'invoice' | 'gallery';

interface PortalData {
  event: any; client: any; tenant: any;
  quote: any | null; contract: any | null;
  invoice: any | null; gallery: any | null;
  assets: any[];
}

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

export default function ClientPortalPage() {
  const { portalToken } = useParams<{ portalToken: string }>();
  const searchParams    = useSearchParams();

  const [data,        setData]        = useState<PortalData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<Tab>((searchParams.get('tab') as Tab) || 'quote');
  const [sigName,     setSigName]     = useState('');
  const [declining,   setDeclining]   = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [processing,  setProcessing]  = useState(false);
  const [message,     setMessage]     = useState('');
  // showPayment: null = hidden | 'full' = full balance | milestoneId = that milestone
  const [showPayment, setShowPayment] = useState<string | null>(null);

  useEffect(() => { load(); }, [portalToken]);

  // Handle Stripe's redirect back after payment
  useEffect(() => {
    const rs = searchParams.get('redirect_status');
    if (rs === 'succeeded') {
      setMessage('Payment successful! Your invoice has been updated. 🎉');
      setTab('invoice');
      load();
    } else if (rs === 'failed') {
      setMessage('Payment was not completed. Please try again.');
      setTab('invoice');
    }
  }, []);

  async function load() {
    const r = await fetch('/api/portal/' + portalToken);
    if (r.ok) { setData(await r.json()); }
    setLoading(false);
  }

  const pc = data?.tenant?.branding?.primaryColor || '#F97316';

  const quoteAccepted  = data?.quote?.status === 'ACCEPTED';
  const contractSigned = data?.contract?.status === 'FULLY_EXECUTED' ||
                         data?.contract?.status === 'CLIENT_SIGNED';
  const invoicePaid    = data?.invoice?.status === 'PAID';

  const tabs: { id: Tab; label: string; icon: any; locked: boolean; done: boolean }[] = [
    { id: 'quote',    label: 'Quote',    icon: FileText, locked: false,             done: quoteAccepted  },
    { id: 'contract', label: 'Contract', icon: FileText, locked: !quoteAccepted,   done: contractSigned },
    { id: 'invoice',  label: 'Invoice',  icon: Receipt,  locked: !contractSigned,  done: invoicePaid    },
    { id: 'gallery',  label: 'Gallery',  icon: Image,    locked: !data?.gallery?.isPublished, done: false },
  ];

  async function acceptQuote() {
    if (!sigName.trim()) { setMessage('Please enter your name to sign'); return; }
    setProcessing(true);
    const r = await fetch('/api/quotes/' + data?.quote?.id + '/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signatureData: sigName, clientName: sigName, portalToken }),
    });
    if (r.ok) { setMessage('Quote accepted! Your contract is now available.'); await load(); setTab('contract'); }
    else { const d = await r.json(); setMessage(d.error || 'Error'); }
    setProcessing(false);
  }

  async function declineQuote() {
    setProcessing(true);
    await fetch('/api/quotes/' + data?.quote?.id + '/decline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: declineReason, portalToken }),
    });
    setMessage('Quote declined. The host will be notified.'); await load(); setProcessing(false);
  }

  async function signContract() {
    if (!sigName.trim()) { setMessage('Please enter your name to sign'); return; }
    setProcessing(true);
    const r = await fetch('/api/contracts/' + data?.contract?.id + '/sign/client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientToken: data?.contract?.clientToken || '', signatureDataUrl: sigName, signerName: sigName }),
    });
    if (r.ok) { setMessage('Contract signed! Your invoice is now available.'); await load(); setTab('invoice'); }
    else { const d = await r.json(); setMessage(d.error || 'Error'); }
    setProcessing(false);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="text-gray-500">Loading your portal...</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-xl font-bold text-gray-700 mb-2">Portal not found</p>
        <p className="text-gray-500">This link may be invalid or expired.</p>
      </div>
    </div>
  );

  const brandColor  = pc;
  const companyName = data.tenant?.branding?.companyName || data.tenant?.name || 'Photo Booth Co.';

  // Payment return URL — Stripe redirects here after card entry
  const paymentReturnUrl =
    (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin) +
    '/portal/' + portalToken + '?tab=invoice';

  // Helper: which milestone (if any) is currently being paid
  const activeMilestone = showPayment && showPayment !== 'full'
    ? data.invoice?.milestones?.find((m: any) => m.id === showPayment)
    : null;
  const payAmountCents = showPayment === 'full'
    ? (data.invoice?.balanceDueCents ?? 0)
    : (activeMilestone?.amountCents ?? 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.tenant?.branding?.logoUrl
              ? <img src={data.tenant.branding.logoUrl} alt={companyName} className="h-10 object-contain"/>
              : <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: brandColor }}>
                  <Camera className="w-5 h-5 text-white"/>
                </div>}
            <div>
              <p className="font-bold text-gray-900">{companyName}</p>
              <p className="text-xs text-gray-500">Client Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold text-sm text-gray-800">{data.event?.title}</p>
            <p className="text-xs text-gray-500">
              {data.event?.eventDate
                ? new Date(data.event.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                : ''}
            </p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex">
            {tabs.map((t, i) => {
              const Icon      = t.icon;
              const active    = tab === t.id;
              const clickable = !t.locked;
              return (
                <button
                  key={t.id}
                  onClick={() => { if (clickable) { setTab(t.id); setShowPayment(null); } }}
                  disabled={t.locked}
                  className={
                    'flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors ' +
                    (active   ? 'border-orange-500 text-orange-600'
                    : t.locked ? 'border-transparent text-gray-300 cursor-not-allowed'
                               : 'border-transparent text-gray-500 hover:text-gray-700 cursor-pointer')
                  }
                >
                  {t.done    ? <CheckCircle2 className="w-4 h-4 text-green-500"/>
                  : t.locked ? <Lock className="w-4 h-4"/>
                             : <Icon className="w-4 h-4"/>}
                  <span className="hidden sm:inline">{t.label}</span>
                  {i < tabs.length - 1 && !t.locked && (
                    <ChevronRight className="w-3 h-3 text-gray-300 hidden sm:inline"/>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {message && (
          <div
            className="mb-6 p-4 rounded-xl border text-sm font-medium"
            style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa', color: '#c2410c' }}
          >
            {message}
          </div>
        )}

        {/* ── QUOTE TAB ────────────────────────────────────────────────────── */}
        {tab === 'quote' && (
          <div className="space-y-6">
            {!data.quote ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>No quote has been sent yet. The host will send your quote shortly.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Quote</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">{data.quote.quoteNumber}</p>
                    </div>
                    <span className={
                      'px-3 py-1 rounded-full text-xs font-bold ' +
                      (data.quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-700'
                      : data.quote.status === 'DECLINED' ? 'bg-red-100 text-red-700'
                      : 'bg-orange-100 text-orange-700')
                    }>
                      {data.quote.status}
                    </span>
                  </div>
                  <div className="p-6">
                    <table className="w-full text-sm mb-6">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Qty</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Price</th>
                          <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quote.lineItems?.map((li: any) => (
                          <tr key={li.id} className="border-b last:border-0">
                            <td className="py-3">{li.description}</td>
                            <td className="py-3 text-right">{li.quantity}</td>
                            <td className="py-3 text-right">{fmt(li.unitCents)}</td>
                            <td className="py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="text-right space-y-1 text-sm border-t pt-4">
                      <p className="text-gray-500">Subtotal: {fmt(data.quote.subtotalCents)}</p>
                      {data.quote.taxAmountCents > 0 && <p className="text-gray-500">Tax: {fmt(data.quote.taxAmountCents)}</p>}
                      {data.quote.discountCents  > 0 && <p className="text-green-600">Discount: -{fmt(data.quote.discountCents)}</p>}
                      <p className="text-2xl font-bold" style={{ color: brandColor }}>Total: {fmt(data.quote.totalCents)}</p>
                    </div>
                    {data.quote.notes && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</p>
                        <p className="text-sm text-gray-700">{data.quote.notes}</p>
                      </div>
                    )}
                    {data.quote.terms && (
                      <div className="mt-3 p-4 bg-gray-50 rounded-xl">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Terms</p>
                        <p className="text-sm text-gray-600">{data.quote.terms}</p>
                      </div>
                    )}
                  </div>
                </div>

                {(data.quote.status === 'SENT' || data.quote.status === 'VIEWED') && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-gray-900">Accept This Quote</h3>
                    <p className="text-sm text-gray-600">By typing your name below, you agree to the terms and authorise this quote.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type your full name to sign *</label>
                      <input
                        type="text" value={sigName}
                        onChange={e => setSigName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2"
                        style={{ fontFamily: 'cursive' }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={acceptQuote} disabled={processing || !sigName.trim()}
                        className="flex-1 py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-50"
                        style={{ backgroundColor: brandColor }}
                      >
                        {processing ? 'Processing...' : '✓ Accept Quote'}
                      </button>
                      <button onClick={() => setDeclining(!declining)} className="px-6 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium text-sm hover:bg-gray-50">
                        Decline
                      </button>
                    </div>
                    {declining && (
                      <div className="space-y-3 pt-2 border-t">
                        <textarea
                          value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                          placeholder="Reason for declining (optional)"
                          className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none h-20 focus:outline-none"
                        />
                        <button onClick={declineQuote} disabled={processing} className="w-full py-2.5 rounded-xl border border-red-300 text-red-600 font-medium text-sm hover:bg-red-50">
                          {processing ? '...' : 'Confirm Decline'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {data.quote.status === 'ACCEPTED' && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0"/>
                    <div>
                      <p className="font-semibold text-green-800">Quote Accepted</p>
                      <p className="text-sm text-green-600">
                        Signed by {data.quote.clientName} on{' '}
                        {data.quote.clientSignedAt ? new Date(data.quote.clientSignedAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button onClick={() => setTab('contract')} className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg" style={{ backgroundColor: brandColor, color: 'white' }}>
                      View Contract →
                    </button>
                  </div>
                )}

                {data.quote.status === 'DECLINED' && (
                  <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                    <p className="font-semibold text-red-800">Quote Declined</p>
                    {data.quote.declineReason && <p className="text-sm text-red-600">Reason: {data.quote.declineReason}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── CONTRACT TAB ─────────────────────────────────────────────────── */}
        {tab === 'contract' && (
          <div className="space-y-6">
            {!data.contract ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your contract is being prepared. Check back shortly.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Contract</p>
                      <p className="text-xl font-bold text-gray-900 mt-0.5">{data.contract.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                        <Printer className="w-4 h-4"/>Print
                      </button>
                      <span className={
                        'px-3 py-1 rounded-full text-xs font-bold self-center ' +
                        (contractSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')
                      }>
                        {data.contract.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="p-6 prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: data.contract.bodyHtml || '' }}/>
                </div>

                {!contractSigned && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm">
                    <h3 className="font-bold text-gray-900">Sign This Contract</h3>
                    <p className="text-sm text-gray-600">By typing your name, you agree to all terms in this contract.</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type your full name to sign *</label>
                      <input
                        type="text" value={sigName}
                        onChange={e => setSigName(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2"
                        style={{ fontFamily: 'cursive' }}
                      />
                    </div>
                    <button
                      onClick={signContract} disabled={processing || !sigName.trim()}
                      className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      {processing ? 'Signing...' : '✓ Sign Contract'}
                    </button>
                  </div>
                )}

                {contractSigned && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 className="w-5 h-5 text-green-600"/>
                    <div>
                      <p className="font-semibold text-green-800">Contract Signed</p>
                      <p className="text-sm text-green-600">
                        Signed on {data.contract.clientSignedAt ? new Date(data.contract.clientSignedAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                    <button onClick={() => setTab('invoice')} className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg" style={{ backgroundColor: brandColor, color: 'white' }}>
                      View Invoice →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── INVOICE TAB ──────────────────────────────────────────────────── */}
        {tab === 'invoice' && (
          <div className="space-y-6">
            {!data.invoice ? (
              <div className="text-center py-16 text-gray-400">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your invoice is being prepared.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Invoice header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Invoice</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{data.invoice.invoiceNumber}</p>
                  </div>
                  <span className={
                    'px-3 py-1 rounded-full text-xs font-bold ' +
                    (data.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')
                  }>
                    {data.invoice.status}
                  </span>
                </div>

                <div className="p-6 space-y-4">
                  {/* Line items */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoice.lineItems?.map((li: any) => (
                        <tr key={li.id} className="border-b last:border-0">
                          <td className="py-3">{li.description}</td>
                          <td className="py-3 text-right font-medium">{fmt(li.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals */}
                  <div className="text-right space-y-1 text-sm border-t pt-4">
                    <p className="text-gray-500">Total: {fmt(data.invoice.totalCents)}</p>
                    <p className="text-gray-500">Paid: {fmt(data.invoice.amountPaidCents)}</p>
                    <p className="text-xl font-bold" style={{ color: data.invoice.balanceDueCents > 0 ? brandColor : '#16a34a' }}>
                      Balance Due: {fmt(data.invoice.balanceDueCents)}
                    </p>
                  </div>

                  {/* Payment schedule (milestones) */}
                  {data.invoice.milestones && data.invoice.milestones.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Payment Schedule</p>
                      {data.invoice.milestones.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between py-3 border-b last:border-0">
                          <div>
                            <p className="font-medium text-sm">{m.label}</p>
                            <p className="text-xs text-gray-500">Due {new Date(m.dueDate).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <p className="font-semibold text-sm">{fmt(m.amountCents)}</p>
                            {m.status === 'PAID' ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">PAID</span>
                            ) : (
                              <button
                                onClick={() => { setShowPayment(m.id); }}
                                className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                                style={{ backgroundColor: brandColor }}
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full balance Pay Now (shown when no milestones and balance > 0) */}
                  {data.invoice.balanceDueCents > 0 &&
                   (!data.invoice.milestones || data.invoice.milestones.length === 0) &&
                   !showPayment && (
                    <div className="pt-2">
                      <button
                        onClick={() => setShowPayment('full')}
                        className="w-full py-3 rounded-xl text-white font-bold"
                        style={{ backgroundColor: brandColor }}
                      >
                        Pay Now — {fmt(data.invoice.balanceDueCents)}
                      </button>
                      <p className="text-xs text-center text-gray-400 mt-2">Secure payment powered by Stripe</p>
                    </div>
                  )}

                  {/* Stripe payment form — appears when client clicks any Pay button */}
                  {showPayment && (
                    <div className="border-t pt-5 mt-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-800">
                          {showPayment === 'full'
                            ? 'Pay ' + fmt(data.invoice.balanceDueCents)
                            : 'Pay ' + fmt(activeMilestone?.amountCents ?? 0) + ' — ' + (activeMilestone?.label ?? '')}
                        </p>
                      </div>
                      <InvoicePaymentForm
                        invoiceId={data.invoice.id}
                        milestoneId={showPayment === 'full' ? undefined : showPayment}
                        amountCents={payAmountCents}
                        brandColor={brandColor}
                        returnUrl={paymentReturnUrl}
                      />
                      <button
                        onClick={() => setShowPayment(null)}
                        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        )}

        {/* ── GALLERY TAB ──────────────────────────────────────────────────── */}
        {tab === 'gallery' && (
          <div className="space-y-6">
            {!data.gallery?.isPublished ? (
              <div className="text-center py-16 text-gray-400">
                <Image className="w-12 h-12 mx-auto mb-4 opacity-30"/>
                <p>Your gallery will appear here after your event.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-lg">{data.gallery.title}</h3>
                  <p className="text-sm text-gray-500">{data.assets.length} photos</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.assets.map((a: any) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-xl overflow-hidden block hover:opacity-90 transition-opacity">
                      <img src={a.url} alt="" className="w-full h-full object-cover"/>
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{\`@media print { header, nav { display: none; } }\`}</style>
    </div>
  );
}
`);

// ─── Verify ───────────────────────────────────────────────────────────────────
const files = [
  'src/lib/stripe.ts',
  'src/app/api/stripe/connect/callback/route.ts',
  'src/app/api/stripe/connect/dashboard/route.ts',
  'src/app/api/webhooks/stripe/route.ts',
  'src/app/api/public/stripe/payment-intent/route.ts',
  'src/components/stripe/PaymentForm.tsx',
  'src/app/portal/[portalToken]/page.tsx',
];

console.log('\n── Verifying files ──');
let allOk = true;
files.forEach(f => {
  const exists = fs.existsSync(path.join(ROOT, f));
  console.log((exists ? '  ✓  ' : '  ✗  ') + f);
  if (!exists) allOk = false;
});

if (allOk) {
  console.log('\n✅  All 7 files created.\n');
  console.log('══════════════════════════════════════════════════════');
  console.log('  NEXT STEPS');
  console.log('══════════════════════════════════════════════════════');
  console.log('\n1. Install Stripe client libs:');
  console.log('   npm install @stripe/stripe-js @stripe/react-stripe-js\n');
  console.log('2. Add to .env.local (if not already there):');
  console.log('   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."');
  console.log('   STRIPE_PLATFORM_FEE_PERCENT="2"\n');
  console.log('3. Add same vars to Vercel → Settings → Environment Variables\n');
  console.log('4. Stripe Dashboard → Developers → Webhooks:');
  console.log('   Endpoint: https://boothgen.vercel.app/api/webhooks/stripe');
  console.log('   Events:   payment_intent.succeeded');
  console.log('             payment_intent.payment_failed');
  console.log('             account.updated\n');
  console.log('5. git add . && git commit -m "feat: Stripe Connect payments" && git push\n');
} else {
  console.log('\n❌  Some files failed. Check errors above.\n');
  process.exit(1);
}
