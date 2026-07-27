import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { Check, Star, Shield, ArrowRight, Users } from 'lucide-react';
import { ClaimForm } from './ClaimForm';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Founding Member Access — Booth Genius',
  description: 'One payment. Full Pro access. Zero monthly fees and zero commission cuts — for life.',
  robots: 'noindex',
};

const TIER_PRICES = [300, 400, 500] as const;
const TIER_SPOTS  = [25,  25,  50 ] as const;

async function getFoundingState() {
  const [settings, r1Count, r2Count, r3Count] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: ['founding_enabled', 'founding_round', 'founding_spots_limit'] } },
    }),
    prisma.foundingMember.count({ where: { tier: 1, status: { in: ['PAID', 'SETUP_COMPLETE'] } } }),
    prisma.foundingMember.count({ where: { tier: 2, status: { in: ['PAID', 'SETUP_COMPLETE'] } } }),
    prisma.foundingMember.count({ where: { tier: 3, status: { in: ['PAID', 'SETUP_COMPLETE'] } } }),
  ]);
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const enabled    = map.founding_enabled !== 'false';
  const round      = Math.max(1, Math.min(3, parseInt(map.founding_round ?? '1') || 1)) as 1 | 2 | 3;
  const spotLimit  = parseInt(map.founding_spots_limit ?? '5') || 5;
  const claimedMap = [r1Count, r2Count, r3Count];
  const claimedNow = claimedMap[round - 1];
  const spotsLeft  = Math.max(0, spotLimit - claimedNow);
  const totalClaimed = r1Count + r2Count + r3Count;
  return { enabled, round, spotLimit, spotsLeft, claimedNow, totalClaimed, claimedMap };
}

const ALL_FEATURES = [
  'Lead & inquiry management',
  'Event & booking management',
  'Invoicing with milestone payments',
  'Digital contracts & e-signatures',
  'Client payment portal',
  'Automated follow-up emails',
  'Calendar & availability management',
  'Embed booking form on your website',
  'Stripe-powered secure payments',
  'Post-event photo gallery with client access codes',
];

const FOUNDER_EXTRAS = [
  'Founding Member badge in your account',
  'Direct line to Geoffrey (founder) — skip the queue forever',
  'Your feedback shapes what gets built next',
];

export default async function LifetimePage() {
  const { enabled, round, spotLimit, spotsLeft, claimedNow, totalClaimed, claimedMap } = await getFoundingState();
  const price = TIER_PRICES[round - 1];
  const totalSpots = TIER_SPOTS.reduce((a, b) => a + b, 0);
  const pctFill = Math.min(100, (claimedNow / spotLimit) * 100);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal nav — no links that distract from converting */}
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Founding Member Offer</span>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-100 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-1.5 mb-6">
            <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
            <span className="text-xs font-bold text-orange-700 uppercase tracking-widest">Founding Member Offer</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-4">
            Zero monthly fees.<br />Zero commission. For life.
          </h1>
          <p className="text-xl text-gray-500 mb-8 max-w-xl mx-auto">
            One payment. Full Pro access to every feature — now and everything we build next.
          </p>

          <div className="flex items-center justify-center gap-6 flex-wrap text-sm text-gray-500 mb-10">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" />US & Canada only</span>
            <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-green-500" />14-day full refund</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-green-500" />{totalSpots} total spots ever</span>
          </div>

          <a
            href="#claim"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-lg px-8 py-4 rounded-2xl transition-colors shadow-lg shadow-orange-200"
          >
            Claim Your Founding Spot — ${price}
            <ArrowRight className="w-5 h-5" />
          </a>
          <p className="text-xs text-gray-400 mt-3">This rate won&apos;t be offered again after founding spots fill.</p>
        </div>
      </section>

      {/* Spot counter */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-gray-700">Round {round} — ${price}/lifetime</p>
              {enabled && spotsLeft > 0 ? (
                <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full">
                  {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} remaining
                </span>
              ) : (
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {enabled ? 'This batch is full' : 'Offer paused'}
                </span>
              )}
            </div>

            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mt-3 mb-5">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${pctFill}%` }}
              />
            </div>

            <p className="text-sm text-gray-500 mb-6">
              The price increases with each round. Once all {totalSpots} founding spots are claimed, this offer is permanently gone.
            </p>

            {/* Tier table */}
            <div className="grid grid-cols-3 gap-3">
              {([1, 2, 3] as const).map(tier => {
                const isCurrent = tier === round;
                const isDone    = tier < round || claimedMap[tier - 1] >= TIER_SPOTS[tier - 1];
                return (
                  <div
                    key={tier}
                    className={`rounded-xl border p-4 text-center transition-all ${
                      isCurrent
                        ? 'border-orange-400 bg-orange-50 shadow-sm'
                        : isDone
                        ? 'border-gray-200 bg-gray-50 opacity-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${isCurrent ? 'text-orange-600' : 'text-gray-400'}`}>
                      Round {tier}
                    </p>
                    <p className={`text-2xl font-extrabold ${isCurrent ? 'text-orange-600' : 'text-gray-500'}`}>
                      ${TIER_PRICES[tier - 1]}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{TIER_SPOTS[tier - 1]} spots</p>
                    {isDone && <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">Claimed</p>}
                    {isCurrent && <p className="text-[10px] font-bold text-orange-500 mt-1 uppercase">← You are here</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="py-4 px-4 pb-12">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Everything Pro includes — forever</h2>

            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {ALL_FEATURES.map(f => (
                <div key={f} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700">{f}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-4">Founding member extras</p>
              <div className="space-y-2.5">
                {FOUNDER_EXTRAS.map(f => (
                  <div key={f} className="flex items-start gap-2.5">
                    <Star className="w-4 h-4 text-orange-400 fill-orange-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-700">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Guarantee */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 flex items-start gap-5">
            <Shield className="w-8 h-8 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-bold text-green-900 mb-2">14-Day Full Refund Guarantee</h2>
              <p className="text-sm text-green-800">
                If Booth Genius isn&apos;t the right fit for your business within 14 days of purchase, message us and we&apos;ll refund every dollar. No hoops, no hold times, no questions asked.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Claim form */}
      <section id="claim" className="pb-16 px-4">
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-2xl border-2 border-orange-400 shadow-xl shadow-orange-100 p-8">
            <div className="text-center mb-6">
              <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-2">Claim Your Spot</p>
              <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Round {round} — ${price} lifetime</h2>
              {enabled && spotsLeft > 0 ? (
                <p className="text-sm text-gray-500">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} remaining at this price</p>
              ) : (
                <p className="text-sm text-red-500 font-medium">
                  {enabled ? 'This batch is full. Join the waitlist below.' : 'This offer is temporarily paused.'}
                </p>
              )}
            </div>

            <ClaimForm enabled={enabled && spotsLeft > 0} price={price} round={round} />

            <p className="text-xs text-gray-400 text-center mt-4">
              After payment you&apos;ll receive a setup link via email. You can use any email for your Booth Genius account — it doesn&apos;t need to match your payment email.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-lg font-bold text-gray-900 mb-6 text-center">Quick answers</h2>
          <div className="space-y-4">
            {[
              {
                q: 'What happens after I pay?',
                a: "You'll receive an email with a unique link to create your Booth Genius account. You can use any email you want for the account — it doesn't need to match your payment email.",
              },
              {
                q: 'What features are included in Pro?',
                a: 'Everything in the app: leads, quotes, contracts, invoices, milestone payments, client portal, automated follow-ups, calendar, and the post-event photo gallery with client access codes.',
              },
              {
                q: 'Is this available in Canada?',
                a: 'Yes. Booth Genius is built specifically for US and Canadian photo booth operators.',
              },
              {
                q: 'What if I already use the regular monthly plan?',
                a: "Contact Geoffrey directly — he'll convert your account to a Founding Membership. Reach out via the support page.",
              },
              {
                q: 'Want the regular monthly or commission plan instead?',
                a: null,
                link: true,
              },
            ].map(item => (
              <div key={item.q} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="font-semibold text-gray-900 mb-1.5">{item.q}</p>
                {item.a && <p className="text-sm text-gray-500">{item.a}</p>}
                {item.link && (
                  <p className="text-sm text-gray-500">
                    Start free on the commission plan or go Pro monthly at{' '}
                    <Link href="/pricing" className="text-orange-500 font-medium hover:underline">boothgen.com/pricing →</Link>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} Booth Genius · Available for US & Canada operators</p>
        <p className="mt-1">
          <Link href="/pricing" className="hover:text-gray-600">Regular plans</Link>
          {' · '}
          <Link href="/support" className="hover:text-gray-600">Support</Link>
          {' · '}
          <Link href="/" className="hover:text-gray-600">Home</Link>
        </p>
      </footer>
    </div>
  );
}
