import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';

export const metadata: Metadata = {
  title: 'Booth Genius — Photo Booth Business Software | Free to Start',
  description:
    'Booth Genius is the all-in-one CRM for photo booth operators. Manage leads, quotes, contracts, invoices, and photo galleries in one place. Start for free — pay only when you book events.',
  openGraph: {
    title: 'Booth Genius — Photo Booth Business Software',
    description: 'The photo booth CRM that grows with your business. Commission-based plan for new operators, flat subscription for high-volume businesses.',
    type: 'website',
  },
};

async function getPricing() {
  const keys = ['price_display_monthly', 'price_display_annual', 'commission_percentage'];
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return {
    monthly: map.price_display_monthly || '',
    annual: map.price_display_annual || '',
    commissionPct: map.commission_percentage || '5',
  };
}

const FEATURES = [
  {
    icon: '📥',
    title: 'Embeddable Lead Capture',
    desc: 'Paste one line of code on any website and start collecting inquiries automatically. Every lead lands in your dashboard, ready to follow up.',
    pro: false,
  },
  {
    icon: '📄',
    title: 'Quotes, Contracts & E-Signatures',
    desc: 'Send professional quotes and legally binding contracts clients can review, approve, and digitally sign — without third-party services or extra fees.',
    pro: false,
  },
  {
    icon: '💳',
    title: 'Online Invoicing & Payments',
    desc: 'Create invoices with flexible payment schedules and deposit milestones. Clients pay securely by card — funds go directly to your bank account via Stripe.',
    pro: false,
  },
  {
    icon: '🖼️',
    title: 'Branded Client Portal',
    desc: 'Every client gets a single, mobile-friendly link to review their quote, sign the contract, pay their invoice, and view their gallery — all branded as you.',
    pro: false,
  },
  {
    icon: '📸',
    title: 'Private Photo Gallery',
    desc: 'Upload event photos, share a private client gallery, and let guests download photos via a separate guest-safe link — your billing details stay hidden.',
    pro: true,
  },
  {
    icon: '🎨',
    title: 'Template Design Approval',
    desc: 'Share booth template designs for client review. Clients approve or request revisions — you get notified immediately and can track version history.',
    pro: false,
  },
  {
    icon: '⚡',
    title: 'Automated Follow-Ups',
    desc: 'Set up email automations triggered by lead submission, quote acceptance, or contract signing. Stay in front of prospects without lifting a finger.',
    pro: false,
  },
  {
    icon: '👥',
    title: 'Team Management',
    desc: 'Invite booth staff as team members. They see only their assigned events — your financial data stays private. Role-based access built in.',
    pro: false,
  },
  {
    icon: '📊',
    title: 'Business Analytics',
    desc: 'Track revenue, conversion rates, event counts, and top clients. Know exactly which months are busy and where leads are coming from.',
    pro: false,
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Set up in minutes',
    desc: 'Upload your logo, set your brand color, and connect your Stripe account. Add your services and packages. Your client-facing portal is live immediately.',
  },
  {
    step: '02',
    title: 'Capture and convert leads',
    desc: 'Embed the inquiry form on your website. Respond to leads, send a quote in seconds, get it signed, collect payment — all without leaving the platform.',
  },
  {
    step: '03',
    title: 'Deliver and delight',
    desc: 'After the event, upload photos to the private gallery. Clients get a notification and a one-click gallery link. Guests get a separate share link that protects your client\'s privacy.',
  },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.userId) {
    if (session.globalRole === 'SUPER_ADMIN') redirect('/super-admin');
    if (!session.tenantId) redirect('/onboarding');
    redirect('/dashboard');
  }

  const pricing = await getPricing();

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAV ───────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BoothGeniusLogo size="sm" showTagline={false} />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link
              href="/sign-in"
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50 pt-20 pb-28 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-wide mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block"/>
            Made for new &amp; small photo booth operators
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Look professional<br className="hidden sm:block"/>
            <span className="text-orange-500"> from your very first booking</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Quotes, contracts, invoices, and a branded client portal — all in one place. Start for free with no monthly fee. You only pay when you get paid.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-in"
              className="px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-200 hover:-translate-y-0.5"
            >
              Start for free — no credit card
            </Link>
            <a
              href="#how-it-works"
              className="px-8 py-4 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-2xl text-base transition-all hover:bg-gray-50"
            >
              See how it works →
            </a>
          </div>
          <p className="mt-5 text-xs text-gray-400">Commission-based — we only make money when you do.</p>
        </div>

        {/* Decorative grid */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-orange-100/40 blur-3xl"/>
        </div>
      </section>

      {/* ── TRUST BAR ─────────────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-5 px-4">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-6 sm:gap-10 text-sm font-medium text-gray-500">
          {['Free to start — no card required', 'Pay only when you collect', 'E-signatures included', 'Branded client portal', 'Automated emails', 'Team access'].map(item => (
            <span key={item} className="flex items-center gap-2">
              <span className="text-orange-500">✓</span> {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Everything you need to run a photo booth business
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Stop juggling spreadsheets, DocuSign, and three different apps. Booth Genius handles every step from inquiry to gallery delivery.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <article key={f.title} className={`bg-white rounded-2xl border p-6 hover:shadow-md transition-all group relative ${f.pro ? 'border-yellow-200 hover:border-yellow-300' : 'border-gray-100 hover:border-orange-100'}`}>
                {f.pro && (
                  <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 tracking-wide uppercase">Pro</span>
                )}
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-gray-900 mb-2 text-base group-hover:text-orange-600 transition-colors">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </article>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Features marked <span className="font-semibold text-yellow-600">Pro</span> require a paid subscription. All other features are included in the free commission plan.</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Up and running in minutes</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">No technical setup, no contracts, no IT team required.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative text-center md:text-left">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-full w-full h-px bg-orange-200 -translate-y-1/2" style={{ width: 'calc(100% - 2rem)', left: 'calc(100% - 0rem)' }} aria-hidden="true"/>
                )}
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-600 font-extrabold text-sm mb-4">
                  {step.step}
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLIENT PORTAL CALLOUT ─────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-8 sm:p-12 text-white flex flex-col md:flex-row gap-8 items-center">
            <div className="flex-1">
              <p className="text-sm font-bold uppercase tracking-widest text-orange-100 mb-3">Built for your clients too</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold mb-4 leading-snug">
                One link. Everything they need.
              </h2>
              <p className="text-orange-100 leading-relaxed mb-6">
                Your clients get a single, mobile-friendly portal link where they can review and accept their quote, sign the contract, pay their invoice, and view their photo gallery — all without creating an account.
              </p>
              <ul className="space-y-2 text-sm text-orange-50">
                {['Digital quote acceptance with e-signature', 'Contract signing on any device', 'Milestone payment schedule with Stripe', 'Private photo gallery with secure guest sharing'].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-amber-200">✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-shrink-0 w-full md:w-64">
              <div className="bg-white/15 rounded-2xl p-5 border border-white/20">
                <div className="space-y-3">
                  {[
                    { icon: '✅', label: 'Quote', status: 'Accepted', color: 'text-green-300' },
                    { icon: '✅', label: 'Contract', status: 'Signed', color: 'text-green-300' },
                    { icon: '💳', label: 'Invoice', status: '$500 due', color: 'text-yellow-200' },
                    { icon: '📸', label: 'Gallery', status: '270 photos', color: 'text-orange-200' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-white/90">{item.icon} {item.label}</span>
                      <span className={`font-semibold ${item.color}`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              You don&apos;t make money, we don&apos;t make money
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              New operators start free with our commission plan. When your business grows, switch to flat-rate and keep more of every booking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Commission Plan */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8 flex flex-col">
              <div className="mb-6">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold mb-4">
                  Perfect for new operators
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-1">Commission Plan</h3>
                <p className="text-gray-500 text-sm">Start booking without any upfront cost.</p>
              </div>
              <div className="mb-6">
                <p className="text-5xl font-extrabold text-gray-900">
                  {pricing.commissionPct}<span className="text-2xl text-gray-400">%</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">per booking collected</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-600 mb-8 flex-1">
                {[
                  'Leads, quotes, contracts & invoices',
                  'Branded client portal & e-signatures',
                  'Stripe Connect — clients pay you directly',
                  `Only ${pricing.commissionPct}% per booking collected`,
                  'No monthly fee. No setup cost.',
                  'Upgrade to Pro anytime for gallery access',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-orange-500 flex-shrink-0">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-in"
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm text-center transition-colors"
              >
                Start free — no card required
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-gray-900 rounded-3xl border border-gray-800 p-8 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"/>
              <div className="mb-6 relative">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold mb-4">
                  For busier operators
                </div>
                <h3 className="text-xl font-extrabold text-white mb-1">Pro Plan</h3>
                <p className="text-gray-400 text-sm">Flat rate, unlimited bookings, zero commission.</p>
              </div>
              <div className="mb-6 relative">
                {pricing.monthly ? (
                  <div>
                    <p className="text-5xl font-extrabold text-white">{pricing.monthly}</p>
                    {pricing.annual && (
                      <p className="text-sm text-gray-400 mt-1">or {pricing.annual} billed annually</p>
                    )}
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-gray-300">Contact us for pricing</p>
                )}
              </div>
              <ul className="space-y-3 text-sm text-gray-300 mb-8 flex-1 relative">
                {[
                  'Everything in Commission Plan',
                  'Zero commission on any booking',
                  'Priority support',
                  'Unlimited events & clients',
                  'Advanced analytics',
                  'White-label client portal',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="text-orange-400 flex-shrink-0">✓</span> {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-in"
                className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl text-sm text-center transition-colors relative"
              >
                Get started
              </Link>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400 mt-8">
            All plans include Stripe-powered payments. Your clients pay you directly — we never touch the funds.
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            Ready to streamline your bookings?
          </h2>
          <p className="text-lg text-gray-500 mb-10">
            Join photo booth operators who have replaced spreadsheets, DocuSign, and manual invoicing with one simple platform.
          </p>
          <Link
            href="/sign-in"
            className="inline-block px-10 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-200 hover:shadow-xl hover:-translate-y-0.5"
          >
            Create your free account →
          </Link>
          <p className="mt-4 text-sm text-gray-400">No credit card required. Commission plan is free to start.</p>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <BoothGeniusLogo size="sm" showTagline={false} />
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#features" className="hover:text-gray-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-600 transition-colors">Pricing</a>
            <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign In</Link>
          </nav>
          <p>© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
