import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { MarketingNav } from '@/app/MarketingNav';
import { Check, Lock, Zap } from 'lucide-react';
import BreakevenCalculator from './BreakevenCalculator';

export const revalidate = 60;

async function getPricing() {
  const [settings, proSubscriberCount] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: ['price_display_monthly', 'commission_percentage', 'early_adopter_cap'] } },
    }),
    prisma.stripeSubscription.count({ where: { plan: 'MONTHLY', status: 'ACTIVE' } }),
  ]);
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const commissionPct = parseFloat(map.commission_percentage ?? '1.5');
  const proMonthlyPrice = parseFloat((map.price_display_monthly ?? '25').replace(/[^0-9.]/g, '')) || 25;
  const earlyAdopterCap = parseInt(map.early_adopter_cap ?? '50') || 50;
  const spotsRemaining = Math.max(0, earlyAdopterCap - proSubscriberCount);
  const subscriptionsOpen = earlyAdopterCap === 0 || proSubscriberCount < earlyAdopterCap;
  return { commissionPct, proMonthlyPrice, earlyAdopterCap, proSubscriberCount, spotsRemaining, subscriptionsOpen };
}

const FEATURES = [
  'Lead & inquiry management',
  'Event & booking management',
  'Invoicing with milestone payments',
  'Digital contracts & e-signatures',
  'Client payment portal',
  'Automated follow-up emails',
  'Photo gallery with access codes',
  'Calendar & availability management',
  'Embed booking form on your website',
  'Stripe-powered secure payments',
];

export default async function PricingPage() {
  const { commissionPct, proMonthlyPrice, earlyAdopterCap, spotsRemaining, subscriptionsOpen } = await getPricing();

  const pctDisplay = commissionPct % 1 === 0 ? `${commissionPct}` : `${commissionPct}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-white border-b border-gray-100 py-16 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-orange-500 font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
            Simple, honest pricing.<br />No surprises.
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Start free and pay only when you earn — or lock in a flat monthly rate and keep every dollar from every booking.
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6 items-start">

          {/* Free */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Free Plan</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-gray-900">$0</span>
                <span className="text-gray-400 mb-1">/month</span>
              </div>
              <p className="text-orange-600 font-bold text-lg">{pctDisplay}% per booking</p>
              <p className="text-gray-500 text-sm mt-2">We only earn when you earn. No monthly commitment, no credit card required.</p>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6 text-sm">
              <p className="font-semibold text-orange-800">"We only win when you win."</p>
              <p className="text-orange-700 mt-1">Perfect if you're just getting started or book fewer than 3 events a month.</p>
            </div>

            <ul className="space-y-3 mb-8">
              {FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/sign-in"
              className="block w-full text-center py-3.5 rounded-xl border-2 border-orange-500 text-orange-600 font-bold hover:bg-orange-50 transition-colors"
            >
              Start Free — No Credit Card
            </Link>
          </div>

          {/* Pro */}
          <div className="relative bg-white rounded-2xl border-2 border-orange-500 p-8 shadow-lg shadow-orange-100">
            {/* Introductory badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                Introductory Pricing
              </span>
            </div>

            <div className="mb-6 mt-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Pro Plan</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-gray-900">${proMonthlyPrice}</span>
                <span className="text-gray-400 mb-1">/month</span>
              </div>
              <p className="text-green-600 font-bold text-lg">0% per booking — keep it all</p>
              <p className="text-gray-500 text-sm mt-2">One flat rate. No per-booking cuts. This rate is locked in for life as long as you stay subscribed.</p>
            </div>

            {/* Early adopter counter */}
            {subscriptionsOpen ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-amber-800">Rate Lock Guarantee</p>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {earlyAdopterCap > 0 ? `${spotsRemaining} of ${earlyAdopterCap} spots left` : 'Open enrollment'}
                  </span>
                </div>
                {earlyAdopterCap > 0 && (
                  <div className="h-1.5 bg-amber-100 rounded-full mb-2 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: `${Math.min(100, ((earlyAdopterCap - spotsRemaining) / earlyAdopterCap) * 100)}%` }}
                    />
                  </div>
                )}
                <p className="text-xs text-amber-700">
                  Operators who join now keep this rate forever. When pricing changes, yours won't.
                </p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                <p className="text-sm font-bold text-gray-700 mb-1">All introductory spots are claimed</p>
                <p className="text-xs text-gray-500">Join the waitlist and we'll notify you when a new pricing tier opens.</p>
              </div>
            )}

            <ul className="space-y-3 mb-8">
              {FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-sm font-semibold text-orange-700">
                <Lock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                Rate locked in for life
              </li>
            </ul>

            {subscriptionsOpen ? (
              <Link
                href="/sign-in"
                className="block w-full text-center py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors"
              >
                Lock In My Rate →
              </Link>
            ) : (
              <Link
                href="/contact"
                className="block w-full text-center py-3.5 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-bold transition-colors"
              >
                Join the Waitlist
              </Link>
            )}

            <p className="text-center text-xs text-gray-400 mt-3">
              {subscriptionsOpen ? 'This rate won\'t last. Spots fill fast.' : 'We\'ll notify you when new pricing opens.'}
            </p>
          </div>
        </div>
      </section>

      {/* Breakeven calculator */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <BreakevenCalculator commissionPct={commissionPct} proMonthlyPrice={proMonthlyPrice} />
        </div>
      </section>

      {/* Feature parity note */}
      <section className="pb-12 px-4">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl border border-gray-200 p-8">
          <Zap className="w-8 h-8 text-orange-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Every feature. Both plans.</h2>
          <p className="text-gray-500 text-sm">
            We don't lock features behind paywalls. Both Free and Pro include everything Booth Genius has to offer — the only difference is how you pay. Choose based on your volume, not your budget.
          </p>
        </div>
      </section>

      {/* Stripe disclosure */}
      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gray-100 rounded-xl p-6 text-xs text-gray-500 leading-relaxed">
            <p className="font-semibold text-gray-600 mb-2">Payment Processing Disclosure</p>
            <p>
              All booking payments processed through Booth Genius are subject to Stripe's standard payment processing fee of <strong>2.9% + $0.30 per transaction</strong>. This fee is charged by Stripe directly and applies to <strong>both the Free and Pro plans</strong>. It is separate from and in addition to Booth Genius platform pricing. On the Free plan, Stripe's fee and the Booth Genius {pctDisplay}% platform fee are both deducted from each booking. On the Pro plan, only Stripe's fee applies per transaction — Booth Genius does not take a per-booking cut. Booth Genius is not a bank and does not hold funds; all payments are processed and held by Stripe.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
        <p className="mt-1">
          <Link href="/" className="hover:text-gray-600">Home</Link>
          {' · '}
          <Link href="/support" className="hover:text-gray-600">Support</Link>
          {' · '}
          <Link href="/contact" className="hover:text-gray-600">Contact</Link>
        </p>
      </footer>
    </div>
  );
}
