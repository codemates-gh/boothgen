import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { MarketingNav } from '@/app/MarketingNav';
import { Check, Lock, Tablet } from 'lucide-react';
import { eventPriceCents } from '@/lib/genie/payments';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing: Genie and Genius Pro',
  description: 'Genie, the photo booth app: $15 per event, no monthly fee, texts and email included. Genius, the photo booth CRM: Genius Pro, a flat monthly rate with a 14-day free trial and Genie included.',
  keywords: ['photo booth app pricing', 'photo booth software pricing', 'photo booth CRM cost', 'pay per event photo booth'],
  alternates: { canonical: 'https://boothgen.com/pricing' },
  openGraph: {
    title: 'BoothGen Pricing: Genie and Genius Pro',
    description: 'Genie: $15 per event, no monthly fee. Genius Pro: flat monthly rate, 14-day free trial, Genie included.',
    url: 'https://boothgen.com/pricing',
    images: [{ url: '/api/og?title=Simple%2C+Honest+Pricing&subtitle=Genie+per+event.+Genius+Pro+monthly.', width: 1200, height: 630, alt: 'BoothGen Pricing' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BoothGen Pricing',
    description: 'Genie: $15 per event. Genius Pro: flat monthly rate, Genie included.',
    images: ['/api/og?title=Simple%2C+Honest+Pricing&subtitle=Genie+per+event.+Genius+Pro+monthly.'],
  },
};

async function getCadRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { next: { revalidate: 3600 } });
    const data = await res.json();
    return data?.rates?.CAD ?? null;
  } catch {
    return null;
  }
}

async function getPricing() {
  const [settings, proSubscriberCount, cadRate] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: ['price_display_monthly', 'commission_percentage', 'early_adopter_cap'] } },
    }),
    prisma.stripeSubscription.count({ where: { plan: 'MONTHLY', status: 'ACTIVE' } }),
    getCadRate(),
  ]);
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const commissionPct = parseFloat(map.commission_percentage ?? '1.5');
  const proMonthlyPrice = parseFloat((map.price_display_monthly ?? '25').replace(/[^0-9.]/g, '')) || 25;
  const earlyAdopterCap = parseInt(map.early_adopter_cap ?? '50') || 50;
  const spotsRemaining = Math.max(0, earlyAdopterCap - proSubscriberCount);
  const subscriptionsOpen = earlyAdopterCap === 0 || proSubscriberCount < earlyAdopterCap;
  const cadEquivalent = cadRate ? Math.ceil(proMonthlyPrice * cadRate) : null;
  return { commissionPct, proMonthlyPrice, earlyAdopterCap, proSubscriberCount, spotsRemaining, subscriptionsOpen, cadEquivalent };
}

const FREE_FEATURES = [
  'Lead & inquiry management',
  'Event & booking management',
  'Invoicing with milestone payments',
  'Digital contracts & e-signatures',
  'Client payment portal',
  'Automated follow-up emails',
  'Calendar & availability management',
  'Embed booking form on your website',
  'Stripe-powered secure payments',
];

const PRO_ONLY_FEATURES = [
  'Post-event photo gallery with access codes',
  'Genie, the photo booth app, included',
];

const GENIE_FEATURES = [
  'Layouts, props and virtual backdrops',
  'Guest texts and email included',
  'Live galleries and QR photo pages',
  'Printing and boomerangs',
  "Set up and test free; pay when you're ready",
  'Upgrade to Genius anytime and keep everything',
];

export default async function PricingPage() {
  const { proMonthlyPrice, earlyAdopterCap, spotsRemaining, subscriptionsOpen, cadEquivalent } = await getPricing();

  const genieCents = await eventPriceCents();
  const geniePrice = genieCents % 100 === 0 ? `$${genieCents / 100}` : `$${(genieCents / 100).toFixed(2)}`;

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
            Run your booth with Genie and pay per event. Run your business with Genius Pro, Genie included.
          </p>
        </div>
      </section>

      {/* Tier cards: Genie (per event) and Genius Pro (monthly, Genie included) */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6 items-start">

          {/* Genie */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Tablet className="w-3.5 h-3.5"/>Genie, the photo booth app</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-gray-900">{geniePrice}</span>
                <span className="text-gray-400 mb-1">/event</span>
              </div>
              <p className="text-gray-500 text-sm mt-2">No monthly fee. Pay only for the events you run; each payment covers up to 2 tablets.</p>
            </div>
            <ul className="space-y-3 mb-8">
              {GENIE_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/sign-up?product=genie" className="block w-full text-center py-3.5 rounded-xl border-2 border-orange-500 text-orange-600 font-bold hover:bg-orange-50 transition-colors">
              Get Genie
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
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Genius Pro, the photo booth CRM</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-gray-900">${proMonthlyPrice}</span>
                <span className="text-gray-400 mb-1">/month</span>
              </div>
              <p className="text-green-600 font-bold text-lg">14-day free trial · Genie included</p>
              {cadEquivalent && (
                <p className="text-xs text-gray-400 mt-1">≈ CA${cadEquivalent}/month for Canadian operators</p>
              )}
              <p className="text-gray-500 text-sm mt-2">One flat rate. No per-booking cuts. This rate is locked in for life as long as you stay subscribed.</p>
            </div>

            {/* Early adopter counter */}
            {subscriptionsOpen ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-amber-800">Rate Lock Guarantee</p>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {earlyAdopterCap > 0 ? `${spotsRemaining} spot${spotsRemaining !== 1 ? 's' : ''} left` : 'Open enrollment'}
                  </span>
                </div>
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
              {FREE_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
              {PRO_ONLY_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-sm font-semibold text-orange-700">
                <Lock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                <span>
                  Rate locked in for life
                  <span className="block text-xs font-normal text-orange-500 mt-0.5">For early adopters only — limited spots</span>
                </span>
              </li>
            </ul>

            {subscriptionsOpen ? (
              <Link
                href="/sign-up?product=genius"
                className="block w-full text-center py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-colors"
              >
                Start my free trial →
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

      {/* Stripe disclosure */}
      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gray-100 rounded-xl p-6 text-xs text-gray-500 leading-relaxed">
            <p className="font-semibold text-gray-600 mb-2">Payment Processing Disclosure</p>
            <p className="mb-3">
              BoothGen subscription fees are charged in <strong>USD</strong>. Canadian operators are billed the USD amount and their card issuer applies the conversion; the CA$ equivalent shown above is approximate based on the current exchange rate and updates daily.{' '}
              All booking payments processed through BoothGen are subject to Stripe's standard payment processing fee of <strong>2.9% + $0.30 per transaction</strong>. This fee is charged by Stripe directly and is separate from BoothGen pricing. BoothGen does not take a per-booking cut. BoothGen is not a bank and does not hold funds; all payments are processed and held by Stripe.
            </p>
            <p>
              <strong className="text-gray-600">Note for Canadian operators:</strong> When you connect your Stripe account, it is domiciled in Canada. Payments from Canadian-issued cards carry no international card fee. However, if one of your clients pays with a card issued outside Canada (for example, a US or international card), Stripe may apply an additional <strong>1.5% international card fee</strong> on top of the standard 2.9% + $0.30. This is a Stripe fee charged directly to your account — it is not a BoothGen fee and does not apply to the vast majority of Canadian-client bookings.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} BoothGen. All rights reserved.</p>
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
