import Link from 'next/link';
import {
  Smile, Repeat, Send, Images, LayoutTemplate, SlidersHorizontal, Printer, Tablet, WifiOff,
  MonitorPlay, Check, ArrowRight, Inbox, FileText, PenLine, Palette, Camera, Heart,
} from 'lucide-react';
import { BoothGenLogo } from '@/components/brand/BoothGenLogo';
import { prisma } from '@/lib/prisma/client';
import { eventPriceCents } from '@/lib/genie/payments';

// Shared marketing pieces for the Genie-first home page and /photo-booth-app (Genie, the photo booth app).
// Same look as the rest of the marketing site: deep purple hero, orange actions, white and gray-50 sections.

export async function getMarketingPricing() {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ['price_display_monthly', 'commission_percentage', 'terms_content', 'privacy_content'] } } });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  const cents = await eventPriceCents();
  return {
    geniePrice: cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`,
    // Same default as the pricing page
    monthly: String(parseFloat((map.price_display_monthly ?? '25').replace(/[^0-9.]/g, '')) || 25),
    commissionPct: map.commission_percentage || '1.5',
    hasTerms: !!(map.terms_content?.trim()),
    hasPrivacy: !!(map.privacy_content?.trim()),
  };
}

// ── Tablet mockup: Genie's review screen with a 3-photo strip ───────────────
export function TabletMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-6 bg-orange-500/20 blur-3xl rounded-full pointer-events-none"/>
      <div className="relative rounded-[2rem] bg-[#0f0a24] p-3 shadow-2xl border border-white/10">
        <div className="rounded-[1.4rem] overflow-hidden bg-gradient-to-br from-[#2B1766] to-[#160c38] aspect-[4/3] flex items-center justify-center gap-5 p-5">
          {/* Photo strip */}
          <div className="bg-white rounded-md p-1.5 space-y-1.5 w-[28%] rotate-[-4deg] shadow-lg">
            {['from-[#7B55EE] to-[#4A2AB0]', 'from-[#FFC24B] to-[#F59E2A]', 'from-[#ff7aa8] to-[#7B55EE]'].map(g => (
              <div key={g} className={`aspect-[4/3] rounded-sm bg-gradient-to-br ${g} relative overflow-hidden`}>
                <div className="absolute left-1/2 top-[30%] -translate-x-1/2 w-[34%] aspect-square rounded-full bg-white/80"/>
                <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[64%] h-[34%] rounded-t-full bg-white/70"/>
              </div>
            ))}
            <p className="text-[6px] font-bold text-center text-[#2B1766] tracking-widest">RIVERA WEDDING</p>
          </div>
          {/* Share panel */}
          <div className="flex-1 space-y-2.5">
            <p className="text-white text-sm font-bold">Looking good!</p>
            <p className="text-purple-200 text-[10px] leading-snug">Get your photos by text or email, or scan the code.</p>
            {['Text me my photos', 'Email me my photos'].map(t => (
              <div key={t} className="rounded-lg bg-white/10 border border-white/15 text-white text-[10px] px-2.5 py-1.5">{t}</div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded bg-white grid grid-cols-4 gap-px p-1">
                {Array.from({ length: 16 }, (_, i) => <span key={i} className={(i * 7) % 3 ? 'bg-[#160c38]' : 'bg-white'}/>)}
              </div>
              <div className="rounded-lg bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1.5">Print 2 copies</div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex justify-center gap-2 mt-4 flex-wrap">
        {['Virtual props', 'Backdrops', 'Boomerangs', 'Live gallery'].map(t => (
          <span key={t} className="text-[11px] font-semibold text-purple-100 bg-white/10 border border-white/15 rounded-full px-3 py-1">{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── What Genie covers, and why setup is easier ───────────────────────────
// Positioning (G): a simple, dependable booth app for standard events, not the most feature-packed one.
// Written for operators, who already know how a booth works: talk about setup, value and cost.
const INCLUDED = [
  { icon: LayoutTemplate, title: 'Layouts ready to go', desc: '15 ready-made 4×6 and 2×6 layouts, or design your own in the browser with your client\'s colors and logo.' },
  { icon: Send, title: 'Text, email and QR sharing', desc: 'Guests get their photos on their phones right away, on a page with your branding.' },
  { icon: Images, title: 'Event gallery', desc: 'Every session lands in an online gallery you can send to your client after the event.' },
  { icon: Printer, title: 'Printing', desc: 'Prints and copies through the BoothGen print box, a small PC connected to your photo printer.' },
  { icon: Repeat, title: 'Boomerangs', desc: 'Short looping clips when the client wants something beyond photos.' },
  { icon: Smile, title: 'Props and backdrops', desc: 'Virtual props and background removal for the events that want a little extra.' },
];

const EASIER = [
  { icon: SlidersHorizontal, title: 'Set your defaults once', desc: 'Countdown, photos per session, sharing and printing. Every new event starts ready, so most events take minutes to set up.' },
  { icon: MonitorPlay, title: 'Set up from your laptop', desc: 'Prepare events the night before at boothgen.com. At the venue, open the event on the tablet and start.' },
  { icon: Send, title: 'No texting accounts to register', desc: 'Guest texts and email go out through BoothGen and are included. No Twilio sign-up or carrier registration to wait on.' },
  { icon: Check, title: 'Pay only for events you run', desc: 'No monthly subscription eating into slow months. Set up and test free; pay when the event is booked.' },
  { icon: WifiOff, title: 'Keeps going on bad Wi-Fi', desc: 'The booth keeps running offline. Photos and messages go out when the venue\'s Wi-Fi comes back.' },
  { icon: Tablet, title: 'Two tablets per event', desc: 'One payment covers two booths at the same event, or a main booth and a backup.' },
];

function FeatureGrid({ items }: { items: typeof INCLUDED }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map(f => (
        <article key={f.title} className="bg-white rounded-2xl border border-gray-100 p-6 hover:border-orange-100 hover:shadow-md transition-all group">
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center mb-4"><f.icon className="w-5 h-5"/></div>
          <h3 className="font-bold text-gray-900 mb-2 text-base group-hover:text-orange-600 transition-colors">{f.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
        </article>
      ))}
    </div>
  );
}

// Who Genie is for: honest about scope
export function BuiltForSection() {
  const fits = ['Birthdays and graduations', 'School dances and proms', 'Corporate mixers and holiday parties', 'Community and church events', 'A second booth at a big event', 'A backup when your main setup acts up'];
  return (
    <section id="genie" className="py-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Built for everyday events</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5">The booth app for the events you run every week.</h2>
          <div className="space-y-4 text-gray-600 leading-relaxed">
            <p>Genie isn&apos;t trying to be the app with the most effects. It&apos;s for the standard events that make up most of your calendar, where you need a booth that sets up fast, works every time and doesn&apos;t cost a monthly subscription.</p>
            <p>If an event needs every bell and whistle, keep using the tools you have for it. For everything else, Genie keeps it simple.</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-7">
          <p className="text-sm font-bold text-gray-900 mb-4">A good fit for</p>
          <ul className="space-y-3">
            {fits.map(f => <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700"><Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0"/>{f}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function GuestFeatures() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">What&apos;s included</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">What a standard event needs. Nothing extra to learn.</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">The essentials your clients expect, ready out of the box, with a few extras for when they ask.</p>
        </div>
        <FeatureGrid items={INCLUDED}/>
      </div>
    </section>
  );
}

export function OperatorFeatures() {
  return (
    <section className="py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Why operators switch</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Less setup. Lower cost. Fewer accounts.</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Genie takes the busywork out of running standard events, so your time goes to booking more of them.</p>
        </div>
        <FeatureGrid items={EASIER}/>
        <p className="text-center text-sm text-gray-400 mt-8">Genie runs on iPad today. Android is coming.</p>
      </div>
    </section>
  );
}

// ── Genie price band ──────────────────────────────────────────────────────
export function GeniePriceBand({ geniePrice }: { geniePrice: string }) {
  return (
    <section className="py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto bg-gradient-to-br from-[#1e1247] to-[#2D1B69] rounded-3xl p-8 sm:p-14 text-white grid md:grid-cols-[1fr_auto] gap-10 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-4">Simple pricing</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">{geniePrice} per event. That&apos;s it.</h2>
          <p className="text-purple-200 mb-6 max-w-lg">No monthly fee, so slow months cost you nothing. Pay only for the events you run.</p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {['Up to 2 tablets per event', 'Guest texts and email included', 'Live gallery and QR photo pages', 'Set up and test free; pay when you\'re ready'].map(t => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-purple-100"><Check className="w-4 h-4 text-orange-400 mt-0.5 shrink-0"/>{t}</li>
            ))}
          </ul>
        </div>
        <div className="text-center">
          <Link href="/sign-up" className="inline-block px-8 py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">Get Genie</Link>
          <p className="text-xs text-purple-300 mt-3">Free to set up. No credit card to start.</p>
        </div>
      </div>
    </section>
  );
}

// ── Genie and Genius: one connected flow ──────────────────────────────────
const FLOW = [
  { icon: Inbox, label: 'Lead comes in', who: 'Genius' },
  { icon: FileText, label: 'Quote accepted', who: 'Genius' },
  { icon: PenLine, label: 'Contract signed, deposit paid', who: 'Genius' },
  { icon: Palette, label: 'Client approves the design', who: 'Genius' },
  { icon: Camera, label: 'Design is on the booth', who: 'Genie' },
  { icon: Heart, label: 'Gallery delivered', who: 'Both' },
];

export function ConnectedFlow() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">When you&apos;re ready to grow</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Genius, the photo booth CRM. Genie included.</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Genius runs the business side: leads, quotes, e-signatures, invoices and a client portal. Because it&apos;s the same system as Genie, the design your client approves is already on the booth.</p>
        </div>
        <ol className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FLOW.map((s, i) => (
            <li key={s.label} className="relative bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">Step {i + 1}</span>
              <div className="w-10 h-10 mx-auto my-3 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center"><s.icon className="w-5 h-5"/></div>
              <p className="text-sm font-bold text-gray-900 leading-snug">{s.label}</p>
              <p className={'text-[10px] font-bold uppercase tracking-wide mt-2 ' + (s.who === 'Genie' ? 'text-purple-600' : s.who === 'Both' ? 'text-gray-400' : 'text-orange-500')}>{s.who}</p>
            </li>
          ))}
        </ol>
        <div className="text-center mt-10">
          <Link href="/photo-booth-crm" className="inline-flex items-center gap-2 px-7 py-3.5 bg-white border-2 border-orange-500 text-orange-600 font-bold rounded-2xl hover:bg-orange-50 transition-colors">See Genius, the CRM <ArrowRight className="w-4 h-4"/></Link>
        </div>
      </div>
    </section>
  );
}

// ── Plans side by side ────────────────────────────────────────────────────
export function PlansSection({ geniePrice, monthly, commissionPct }: { geniePrice: string; monthly: string; commissionPct: string }) {
  const plans = [
    { name: 'Genie', tag: 'The photo booth app', price: geniePrice, unit: '/event', points: ['Up to 2 tablets per event', 'Texts and email included', 'Galleries and printing', 'No monthly fee'], cta: 'Get Genie', href: '/sign-up', strong: true },
    { name: 'Genius Free', tag: 'The photo booth CRM', price: '$0', unit: '/month', points: [`${commissionPct}% per booking`, 'Leads, quotes, contracts, invoices', 'Client portal and automations', 'Genie included'], cta: 'Start Genius free', href: '/sign-up?product=genius', strong: false },
    { name: 'Genius Pro', tag: 'The photo booth CRM', price: monthly ? `$${monthly.replace(/^\$/, '')}` : 'Flat rate', unit: monthly ? '/month' : '', points: ['0% per booking', 'Everything in Genius Free', 'Private photo galleries', 'Genie included'], cta: 'See Pro', href: '/pricing', strong: false },
  ];
  return (
    <section id="pricing" className="py-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Start with the booth. Add the business when you&apos;re ready.</h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">Switch from Genie to Genius anytime. Your events, designs and galleries come with you.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(p => (
            <div key={p.name} className={'rounded-2xl p-7 flex flex-col ' + (p.strong ? 'bg-white border-2 border-orange-500 shadow-lg shadow-orange-100' : 'bg-white border border-gray-200')}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{p.tag}</p>
              <h3 className="text-xl font-extrabold text-gray-900 mt-1 mb-3">{p.name}</h3>
              <p className="mb-5"><span className="text-4xl font-extrabold text-gray-900">{p.price}</span><span className="text-gray-400">{p.unit}</span></p>
              <ul className="space-y-2.5 mb-7 flex-1">
                {p.points.map(t => <li key={t} className="flex items-start gap-2.5 text-sm text-gray-700"><Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0"/>{t}</li>)}
              </ul>
              <Link href={p.href} className={'block text-center py-3 rounded-xl font-bold transition-colors ' + (p.strong ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'border-2 border-orange-500 text-orange-600 hover:bg-orange-50')}>{p.cta}</Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-gray-400 mt-8"><Link href="/pricing" className="text-orange-500 hover:underline font-medium">Full pricing details →</Link></p>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────
export const genieFaq = (price: string): [string, string][] => [
  ['What is BoothGen?', 'BoothGen makes two products for photo booth operators: Genie, the photo booth app that runs your booth at the event, and Genius, the photo booth CRM that runs your business. BoothGen stands for booth generation: the next generation of photo booth tools.'],
  ['Who is Genie for?', 'Photo booth operators running standard events: birthdays, school events, corporate parties and the like. It covers the essentials well and keeps setup fast. If an event needs every effect available, Genie may not be the right tool for that one.'],
  ['What do I need to run Genie?', 'An iPad and the Genie app. Android is coming. For prints, add the BoothGen print box: a small Windows PC connected to your photo printer.'],
  ['How does paying per event work?', `Set up and test any event for free. Pay ${price} for an event whenever you\'re ready, before or after. Until it\'s paid, the booth screen and photos carry a BoothGen watermark. One payment covers up to 2 tablets at that event.`],
  ['Are texts and email really included?', 'Yes. Guests get their photos by text, email or QR code, sent by BoothGen and included in the event price. You can also connect your own Twilio and email account instead.'],
  ['Does Genie need internet at the venue?', 'Genie keeps running if the Wi-Fi drops. Photos upload and messages go out as soon as it\'s back online.'],
  ['What\'s the difference between Genie and Genius?', 'Genie is the photo booth app: capture, effects, sharing, galleries and printing. Genius is the CRM: leads, quotes, contracts, invoices, a client portal and automations. Genius includes Genie.'],
  ['Can I switch from Genie to Genius later?', 'Yes, anytime. Your events, layouts, props, backdrops and galleries all stay.'],
];

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <section id="faq" className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Questions</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Frequently asked</h2>
        </div>
        <div className="space-y-3">
          {items.map(([q, a]) => (
            <details key={q} className="group bg-white rounded-2xl border border-gray-100 px-6 py-4 open:shadow-sm">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-bold text-gray-900">
                {q}<span className="text-orange-500 text-xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="text-sm text-gray-600 leading-relaxed mt-3">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function faqSchema(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

// ── Final call to action and footer ───────────────────────────────────────
export function FinalCta({ geniePrice }: { geniePrice: string }) {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247]">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-4">The next generation of photo booths</p>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Genie runs the booth.<br/>Genius runs the business.</h2>
        <p className="text-lg text-purple-200 mb-10">Start with Genie for your next event. Free to set up, {geniePrice} when you run it.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/sign-up" className="px-10 py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">Get Genie</Link>
          <Link href="/sign-up?product=genius" className="px-10 py-4 bg-white/10 border border-white/20 hover:bg-white/15 text-white font-semibold rounded-2xl text-base transition-all">Start Genius free</Link>
        </div>
      </div>
    </section>
  );
}

export function MarketingFooter({ hasTerms, hasPrivacy }: { hasTerms: boolean; hasPrivacy: boolean }) {
  return (
    <footer className="border-t border-gray-100 py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <div className="flex flex-col items-center sm:items-start gap-1">
          <BoothGenLogo size="sm" showTagline={false} />
          <p className="text-[11px] text-gray-400">The next generation of photo booths.</p>
        </div>
        <nav className="flex flex-wrap justify-center gap-6">
          <Link href="/photo-booth-app" className="hover:text-gray-600 transition-colors">Genie</Link>
          <Link href="/photo-booth-crm" className="hover:text-gray-600 transition-colors">Genius</Link>
          <Link href="/pricing" className="hover:text-gray-600 transition-colors">Pricing</Link>
          <Link href="/blog" className="hover:text-gray-600 transition-colors">Blog</Link>
          <Link href="/support" className="hover:text-gray-600 transition-colors">Support</Link>
          <Link href="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
          <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign In</Link>
          {hasTerms && <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>}
          {hasPrivacy && <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>}
        </nav>
        <p>© {new Date().getFullYear()} BoothGen (formerly Booth Genius). All rights reserved.</p>
      </div>
    </footer>
  );
}
