import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SlidersHorizontal, Send, Check, WifiOff, Printer, Tablet } from 'lucide-react';
import { MarketingContactForm } from './MarketingContactForm';
import { MarketingNav } from './MarketingNav';
import {
  BuiltForSection, ConnectedFlow, Faq, FinalCta, GeniePriceBand, GuestFeatures, MarketingFooter, OperatorFeatures, PlansSection, TabletMockup,
  faqSchema, genieFaq, getMarketingPricing,
} from './GenieMarketing';

// Home: Genie (the photo booth app) first, Genius (the photo booth CRM) as the next step. Brand: BoothGen.

const TITLE = 'BoothGen: Photo Booth App and CRM';
const DESCRIPTION = 'Genie by BoothGen is the simple photo booth app for standard events: set up in minutes from your laptop, guest texts and email included, $15 per event with no monthly fee. Genius, the photo booth CRM, runs your business.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    'photo booth app', 'iPad photo booth app', 'photo booth software', 'virtual props photo booth', 'photo booth CRM',
    'photo booth business', 'boomerang photo booth', 'photo booth background removal',
  ],
  alternates: { canonical: 'https://boothgen.com' },
  openGraph: {
    title: TITLE, description: DESCRIPTION, type: 'website', url: 'https://boothgen.com', siteName: 'BoothGen',
    images: [{ url: '/api/og?title=The+next+generation+of+photo+booths&subtitle=Genie+runs+the+booth.+Genius+runs+the+business.', width: 1200, height: 630, alt: 'BoothGen' }],
  },
  twitter: {
    card: 'summary_large_image', title: TITLE, description: DESCRIPTION,
    images: ['/api/og?title=The+next+generation+of+photo+booths&subtitle=Genie+runs+the+booth.+Genius+runs+the+business.'],
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BoothGen',
  alternateName: 'Booth Genius',
  url: 'https://boothgen.com',
  logo: 'https://boothgen.com/boothgen-logo-light.svg',
  description: 'BoothGen makes Genie, the photo booth app, and Genius, the photo booth CRM.',
};

const PILLARS = [
  { icon: SlidersHorizontal, label: 'Set up in minutes' },
  { icon: Send, label: 'Texts and email included' },
  { icon: Check, label: 'Pay per event' },
  { icon: Tablet, label: '2 tablets per event' },
  { icon: Printer, label: 'Printing' },
  { icon: WifiOff, label: 'Works on bad Wi-Fi' },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.userId) {
    if (session.globalRole === 'SUPER_ADMIN') redirect('/super-admin');
    if (!session.tenantId) redirect('/onboarding');
    redirect('/dashboard');
  }

  const pricing = await getMarketingPricing();
  const faq = genieFaq(pricing.geniePrice);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faq)) }} />

      <MarketingNav />

      {/* ── HERO: Genie ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247] pt-16 pb-20 px-4 sm:px-6">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/20 text-orange-300 text-xs font-bold uppercase tracking-wide mb-6 border border-orange-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block"/>
                Genie, the photo booth app
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5">
                The simple booth app<br/>for <span className="text-orange-400">everyday events.</span>
              </h1>
              <p className="text-lg text-purple-200 mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Set up an event in minutes from your laptop, open it on the tablet and go. Guest texts and email are included, and you pay only for the events you run.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/sign-up" className="px-7 py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">
                  Get Genie
                </Link>
                <a href="#genie" className="px-7 py-3.5 bg-white/10 border border-white/20 hover:bg-white/15 text-white font-semibold rounded-2xl text-base transition-all">
                  Is it right for my events? →
                </a>
              </div>
              <p className="mt-4 text-xs text-purple-300">{pricing.geniePrice} per event · No monthly fee · Texts and email included</p>
            </div>
            <div className="flex-1 w-full max-w-lg lg:max-w-none">
              <TabletMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── PILLARS ─────────────────────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-white py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-3 lg:grid-cols-6 gap-4">
          {PILLARS.map(p => (
            <div key={p.label} className="text-center">
              <p.icon className="w-6 h-6 mx-auto mb-2 text-orange-500"/>
              <p className="text-xs font-bold text-gray-900">{p.label}</p>
            </div>
          ))}
        </div>
      </section>

      <BuiltForSection />
      <OperatorFeatures />
      <GuestFeatures />
      <GeniePriceBand geniePrice={pricing.geniePrice} />
      <ConnectedFlow />
      <PlansSection geniePrice={pricing.geniePrice} monthly={pricing.monthly} commissionPct={pricing.commissionPct} />

      {/* ── OUR STORY ───────────────────────────────────────────────────────── */}
      <section id="our-story" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-[#1e1247] to-[#2D1B69] rounded-3xl p-8 sm:p-14 text-white">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-4">Our Story</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold mb-5 leading-snug">Built by an operator,<br/>for operators.</h2>
                <div className="space-y-4 text-purple-100 leading-relaxed text-sm sm:text-base">
                  <p>
                    BoothGen wasn&apos;t built in a startup incubator. It was built by someone who spent <strong className="text-white">over a decade running two photo booth businesses</strong> and got tired of juggling spreadsheets, email chains and separate apps for the booth, the bookings and the photos.
                  </p>
                  <p>
                    Genie came from the booth side: effects guests actually use, photos that reach their phones right away, and setup you can do from a laptop the night before. Genius came from the business side: quotes, contracts, deposits and galleries that don&apos;t fall through the cracks.
                  </p>
                  <p>
                    <strong className="text-white">BoothGen stands for booth generation: the next generation of photo booth tools. Genie runs the booth, Genius runs the business.</strong>
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 w-full md:w-64 space-y-4">
                {[
                  ['10+', 'Years in the photo booth industry'],
                  ['2', 'Photo booth businesses operated'],
                  ['100s', 'Of real events that shaped every feature'],
                  ['2', 'Products: Genie and Genius'],
                ].map(([num, label]) => (
                  <div key={label} className="bg-white/10 rounded-2xl p-4 border border-white/10">
                    <p className="text-3xl font-extrabold text-orange-400 mb-1">{num}</p>
                    <p className="text-xs text-purple-200 leading-snug">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Faq items={faq} />
      <FinalCta geniePrice={pricing.geniePrice} />

      {/* ── CONTACT ─────────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-2">Get in Touch</p>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Contact Us</h2>
            <p className="text-gray-500">Have a question about Genie or Genius? Send us a message and we&apos;ll get back to you quickly.</p>
          </div>
          <MarketingContactForm />
        </div>
      </section>

      <MarketingFooter hasTerms={pricing.hasTerms} hasPrivacy={pricing.hasPrivacy} />
    </div>
  );
}
