import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketingNav } from '../MarketingNav';
import {
  BuiltForSection, ConnectedFlow, Faq, FinalCta, GeniePriceBand, GuestFeatures, MarketingFooter, OperatorFeatures, TabletMockup,
  faqSchema, genieFaq, getMarketingPricing,
} from '../GenieMarketing';


// Genie, the photo booth app: the page for search ("photo booth app") and ads

const TITLE = 'Genie, the Photo Booth App';
const DESCRIPTION = 'Genie by BoothGen is the simple photo booth app for standard events: event defaults, layouts ready to go, guest texts and email included, galleries and printing. Set up in minutes, pay per event, no monthly fee.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['photo booth app', 'iPad photo booth app', 'photo booth software', 'virtual props', 'photo booth background removal', 'boomerang photo booth', 'pay per event photo booth'],
  alternates: { canonical: 'https://boothgen.com/photo-booth-app' },
  openGraph: {
    title: TITLE + ' | BoothGen', description: DESCRIPTION, type: 'website', url: 'https://boothgen.com/photo-booth-app', siteName: 'BoothGen',
    images: [{ url: '/api/og?title=Genie%2C+the+Photo+Booth+App&subtitle=Props%2C+backdrops%2C+boomerangs+and+instant+sharing', width: 1200, height: 630, alt: TITLE }],
  },
  twitter: { card: 'summary_large_image', title: TITLE + ' | BoothGen', description: DESCRIPTION },
};

const STEPS = [
  { title: 'Sign up and pair your tablet', desc: 'Create your free account, install Genie and pair the tablet with a code. Takes a few minutes.' },
  { title: 'Set up the event', desc: 'Pick or design layouts, choose props and backdrops, and set how guests get their photos. All from your laptop.' },
  { title: 'Run it and pay when ready', desc: 'Open the event on the tablet at the venue. Pay for the event before or after; one payment covers 2 tablets.' },
];

export default async function PhotoBoothAppPage() {
  const pricing = await getMarketingPricing();
  const faq = genieFaq(pricing.geniePrice, pricing.geniusGeniePrice);
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Genie by BoothGen',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'iPadOS',
    description: DESCRIPTION,
    offers: { '@type': 'Offer', price: pricing.geniePrice.replace('$', ''), priceCurrency: 'USD', description: 'Per event, up to 2 tablets' },
    publisher: { '@type': 'Organization', name: 'BoothGen', url: 'https://boothgen.com' },
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema(faq)) }} />
      <MarketingNav />

      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247] pt-16 pb-20 px-4 sm:px-6">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="max-w-6xl mx-auto relative flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-300 mb-5">Genie by BoothGen</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5">
              Genie, the<br/><span className="text-orange-400">photo booth app.</span>
            </h1>
            <p className="text-lg text-purple-200 mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
              A dependable booth for standard events. Set up from your laptop in minutes, no texting accounts to register, and {pricing.geniePrice} per event with no monthly fee.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link href="/sign-up" className="px-7 py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">Get Genie</Link>
              <a href="#how-it-works" className="px-7 py-3.5 bg-white/10 border border-white/20 hover:bg-white/15 text-white font-semibold rounded-2xl text-base transition-all">How it works →</a>
            </div>
            <p className="mt-4 text-xs text-purple-300">On iPad today. Android coming.</p>
          </div>
          <div className="flex-1 w-full max-w-lg lg:max-w-none"><TabletMockup /></div>
        </div>
      </section>

      <BuiltForSection />
      <OperatorFeatures />
      <GuestFeatures />

      <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Ready for your next event</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">No contracts and no monthly fee. Set up free, test as much as you like.</p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-600 font-extrabold text-sm mb-4">{i + 1}</div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <GeniePriceBand geniePrice={pricing.geniePrice} />
      <ConnectedFlow geniePrice={pricing.geniePrice} geniusGeniePrice={pricing.geniusGeniePrice} />
      <Faq items={faq} />
      <FinalCta geniePrice={pricing.geniePrice} />
      <MarketingFooter hasTerms={pricing.hasTerms} hasPrivacy={pricing.hasPrivacy} />
    </div>
  );
}
