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
    'The all-in-one CRM for photo booth operators. Quotes, contracts, e-signatures, invoices, and client gallery — built by a real photo booth operator. Start free with no monthly fees.',
  openGraph: {
    title: 'Booth Genius — Photo Booth Business Software',
    description: 'Built by an operator who ran two photo booth businesses for 10+ years. Free to start — pay only when you book events.',
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

// ── UI Mockup Components ──────────────────────────────────────────────────────

function BrowserFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
      <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-400"/>
          <div className="w-3 h-3 rounded-full bg-yellow-400"/>
          <div className="w-3 h-3 rounded-full bg-green-400"/>
        </div>
        <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-400 text-center truncate">{url}</div>
      </div>
      {children}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-64 rounded-3xl overflow-hidden shadow-2xl border-4 border-gray-800 bg-white">
      <div className="bg-gray-900 h-6 flex items-center justify-center">
        <div className="w-16 h-1.5 rounded-full bg-gray-700"/>
      </div>
      {children}
    </div>
  );
}

function DashboardMockup() {
  return (
    <BrowserFrame url="boothgen.com/dashboard">
      <div className="flex h-72">
        {/* Sidebar */}
        <div className="w-44 flex-shrink-0 bg-[#1e1247] flex flex-col py-4 px-3 gap-1">
          <div className="mb-3 px-2">
            <div className="text-white text-xs font-bold tracking-wide">My Booth Co.</div>
          </div>
          {[['Dashboard','●'],['Events','○'],['Leads','○'],['Quotes','○'],['Invoices','○']].map(([label, dot]) => (
            <div key={label} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${label === 'Dashboard' ? 'bg-white/10 text-white' : 'text-white/50'}`}>
              <span className="text-orange-400 text-[8px]">{dot}</span>{label}
            </div>
          ))}
        </div>
        {/* Main */}
        <div className="flex-1 bg-gray-50 p-4 overflow-hidden">
          <p className="text-gray-900 font-bold text-sm mb-3">Good morning 👋</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[['Events This Month','4','↑ 2'],['Revenue','$3,200','↑ $800'],['New Leads','7','↑ 3']].map(([label, val, sub]) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-3">
                <p className="text-[9px] text-gray-400 mb-1">{label}</p>
                <p className="text-base font-bold text-gray-900">{val}</p>
                <p className="text-[9px] text-green-600 font-medium">{sub}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-50 flex justify-between items-center">
              <p className="text-[10px] font-semibold text-gray-700">Upcoming Events</p>
            </div>
            {[['Johnson Wedding','Jun 28','BOOKED'],['Martinez Corp Event','Jul 5','BOOKED'],['Rivera Quinceañera','Jul 12','QUOTED']].map(([name, date, status]) => (
              <div key={name} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-[10px] font-semibold text-gray-800">{name}</p>
                  <p className="text-[9px] text-gray-400">{date}</p>
                </div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${status === 'BOOKED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

function PortalMockup() {
  return (
    <BrowserFrame url="boothgen.com/portal/abc123">
      <div className="bg-white">
        {/* Portal header */}
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-white text-xs font-bold">M</div>
            <div>
              <p className="text-xs font-bold text-gray-900">My Booth Co.</p>
              <p className="text-[9px] text-gray-400">Client Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-gray-800">Johnson Wedding</p>
            <p className="text-[9px] text-gray-400">June 28, 2026</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-2">
          {[['✅','Quote'],['✅','Contract'],['💳','Invoice'],['🎨','Design'],['📸','Gallery']].map(([icon, label], i) => (
            <div key={label} className={`flex items-center gap-1 px-3 py-2.5 text-[10px] font-medium border-b-2 ${i === 2 ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400'}`}>
              <span>{icon}</span><span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
        {/* Invoice content */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] text-gray-400 uppercase font-medium">Invoice</p>
              <p className="text-sm font-bold text-gray-900">INV-0042</p>
            </div>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">PARTIALLY PAID</span>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            {[['Booth Rental (4 hrs)','$1,200'],['Photo Strip Prints','$200'],['Backdrop Rental','$150']].map(([desc, amt]) => (
              <div key={desc} className="flex justify-between text-[10px]">
                <span className="text-gray-600">{desc}</span>
                <span className="font-semibold text-gray-800">{amt}</span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2 flex justify-between text-[10px] font-bold">
              <span className="text-orange-600">Balance Due</span>
              <span className="text-orange-600">$775.00</span>
            </div>
          </div>
          <button className="w-full py-2 bg-orange-500 text-white text-[10px] font-bold rounded-lg">Pay Now — $775.00</button>
        </div>
      </div>
    </BrowserFrame>
  );
}

function GalleryPortalMockup() {
  return (
    <BrowserFrame url="boothgen.com/g/xyz789">
      <div className="bg-white">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center text-white text-xs font-bold">M</div>
            <div>
              <p className="text-xs font-bold text-gray-900">My Booth Co.</p>
              <p className="text-[9px] text-gray-400">Photo Gallery</p>
            </div>
          </div>
          <button className="text-[9px] font-semibold border border-gray-200 rounded-lg px-2 py-1 text-gray-600">⬇ Download All</button>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-900">Johnson Wedding Gallery</p>
              <p className="text-[9px] text-gray-400">270 photos</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {Array.from({length: 8}).map((_, i) => (
              <div key={i} className={`aspect-square rounded-lg ${['bg-purple-100','bg-orange-100','bg-blue-100','bg-green-100','bg-pink-100','bg-yellow-100','bg-indigo-100','bg-red-100'][i]}`}/>
            ))}
          </div>
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
            <span className="text-xs">⏰</span>
            <p className="text-[9px] text-amber-700">Photos available until <strong>July 28, 2026</strong>. Download before then.</p>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

function MobilePortalMockup() {
  return (
    <PhoneFrame>
      <div className="bg-white">
        <div className="border-b border-gray-100 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center text-white text-[8px] font-bold">M</div>
            <p className="text-[9px] font-bold text-gray-900">My Booth Co.</p>
          </div>
        </div>
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {['✅','✅','💳','🎨','📸'].map((icon, i) => (
            <div key={i} className={`px-3 py-2 text-xs border-b-2 flex-shrink-0 ${i === 4 ? 'border-orange-500' : 'border-transparent'}`}>{icon}</div>
          ))}
        </div>
        <div className="p-3 space-y-2">
          <p className="text-xs font-bold text-gray-900">Gallery</p>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({length: 6}).map((_, i) => (
              <div key={i} className={`aspect-square rounded-lg ${['bg-purple-100','bg-orange-100','bg-blue-100','bg-green-100','bg-pink-100','bg-yellow-100'][i]}`}/>
            ))}
          </div>
          <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-[8px] text-blue-700"><strong>Sharing your photos?</strong> Use Share Gallery Link — keeps your payment details private.</p>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function QuoteMockup() {
  return (
    <BrowserFrame url="boothgen.com/portal/abc123?tab=quote">
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-gray-400 uppercase font-medium">Quote</p>
            <p className="text-sm font-bold text-gray-900">QTE-0019</p>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">SENT</span>
        </div>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-3 py-1.5 grid grid-cols-4 text-[8px] font-medium text-gray-400 uppercase">
            <span className="col-span-2">Description</span><span className="text-right">Qty</span><span className="text-right">Total</span>
          </div>
          {[['Photo Booth (4 hrs)','1','$1,200'],['Premium Backdrop','1','$150'],['Guest Book Add-On','1','$75']].map(([d,q,t]) => (
            <div key={d} className="px-3 py-2 grid grid-cols-4 text-[9px] border-t border-gray-50">
              <span className="col-span-2 text-gray-700">{d}</span>
              <span className="text-right text-gray-500">{q}</span>
              <span className="text-right font-semibold text-gray-800">{t}</span>
            </div>
          ))}
          <div className="px-3 py-2 border-t border-gray-200 flex justify-between">
            <span className="text-[9px] font-bold text-orange-600">Total</span>
            <span className="text-[9px] font-bold text-orange-600">$1,425.00</span>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[9px] font-medium text-gray-700">Type your full name to accept</p>
          <div className="border border-gray-200 rounded-lg px-3 py-2 text-[10px] text-gray-400 italic">Sarah Johnson</div>
          <button className="w-full py-2 bg-orange-500 text-white text-[10px] font-bold rounded-lg">✓ Accept Quote</button>
        </div>
      </div>
    </BrowserFrame>
  );
}

const FEATURES = [
  { icon: '📥', title: 'Embeddable Lead Capture', desc: 'One snippet on your website captures every inquiry automatically into your dashboard.', pro: false },
  { icon: '📄', title: 'Quotes & E-Signatures', desc: 'Send professional quotes clients can review, accept, and sign digitally — no DocuSign needed.', pro: false },
  { icon: '💳', title: 'Invoicing & Payments', desc: 'Milestone payment schedules, deposit tracking, and Stripe-powered card payments that go straight to you.', pro: false },
  { icon: '🖼️', title: 'Branded Client Portal', desc: 'One link gives clients access to their quote, contract, invoice, and gallery — all in your brand.', pro: false },
  { icon: '📸', title: 'Private Photo Gallery', desc: 'Deliver event photos to clients privately. Guests get a separate link that never exposes billing details.', pro: true },
  { icon: '🎨', title: 'Template Design Approval', desc: 'Share booth template designs for review. Track approvals and revision requests in one place.', pro: false },
  { icon: '⚡', title: 'Automated Follow-Ups', desc: 'Email sequences triggered by lead submission, signing, and payment — run on autopilot.', pro: false },
  { icon: '👥', title: 'Team Management', desc: 'Invite staff with role-based access. They see their events; your financials stay private.', pro: false },
  { icon: '📊', title: 'Business Analytics', desc: 'Revenue, conversion rates, and monthly booking trends at a glance.', pro: false },
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

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BoothGeniusLogo size="sm" showTagline={false} />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
            <a href="#our-story" className="hover:text-gray-900 transition-colors">Our Story</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block">Sign in</Link>
            <Link href="/sign-in" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50 pt-16 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            {/* Text */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold uppercase tracking-wide mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse inline-block"/>
                Made for new &amp; small photo booth operators
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                Look professional<br/>
                <span className="text-orange-500">from your very first booking</span>
              </h1>
              <p className="text-lg text-gray-500 mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Quotes, contracts, invoices, and a branded client portal — all in one place. Built by a real photo booth operator who spent 10+ years running two successful businesses.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/sign-in" className="px-7 py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-200 hover:-translate-y-0.5">
                  Start free — no credit card
                </Link>
                <a href="#our-story" className="px-7 py-3.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold rounded-2xl text-base transition-all hover:bg-gray-50">
                  Our story →
                </a>
              </div>
              <p className="mt-4 text-xs text-gray-400">Commission-based — we only earn when you do.</p>
            </div>
            {/* Dashboard mockup */}
            <div className="flex-1 w-full max-w-lg lg:max-w-none">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BAR ────────────────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-5 px-4">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-6 sm:gap-10 text-sm font-medium text-gray-500">
          {['Free to start — no card required','Pay only when you collect','E-signatures included','Branded client portal','Automated emails','Team access'].map(item => (
            <span key={item} className="flex items-center gap-2"><span className="text-orange-500">✓</span>{item}</span>
          ))}
        </div>
      </section>

      {/* ── CLIENT PORTAL SHOWCASE ────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 w-full max-w-lg">
              <PortalMockup />
            </div>
            <div className="flex-1 lg:pl-8">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Client Portal</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                One link.<br/>Everything your client needs.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Your clients get a single, mobile-friendly portal link where they can review and accept their quote, sign the contract, pay their invoice, and download their gallery — no app download, no account required.
              </p>
              <ul className="space-y-3 text-sm text-gray-700">
                {['Digital quote acceptance with typed e-signature','Contract signing on any device','Milestone payment schedule powered by Stripe','Photo gallery with secure guest sharing link','Overdue balance gate — gallery unlocks only when paid'].map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs flex items-center justify-center flex-shrink-0 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUOTE SHOWCASE ───────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
            <div className="flex-1 w-full max-w-lg">
              <QuoteMockup />
            </div>
            <div className="flex-1 lg:pr-8">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Quotes & Contracts</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                Send a proposal.<br/>Get a signature. Get paid.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Build quotes from your saved packages, send them in seconds, and let clients accept and sign digitally — all without leaving your dashboard or paying for DocuSign.
              </p>
              <ul className="space-y-3 text-sm text-gray-700">
                {['Quote builder with saved packages & pricing','Client accepts with typed digital signature','Contract auto-generated and ready to sign','PDF export for your records','Automated status tracking — New → Quoted → Booked'].map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs flex items-center justify-center flex-shrink-0 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── GALLERY SHOWCASE ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 w-full max-w-lg">
              <GalleryPortalMockup />
            </div>
            <div className="flex-1 lg:pl-8">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Photo Gallery</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 uppercase tracking-wide">Pro</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                Deliver photos<br/>the professional way.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Upload event photos directly from your dashboard. Clients view and download privately. Guests get a completely separate share link — your client&apos;s billing details stay hidden from everyone else.
              </p>
              <ul className="space-y-3 text-sm text-gray-700">
                {['Bulk upload hundreds of photos at once','Password-protected galleries','Guest-safe share link — never exposes invoice or quote','Lightbox viewer with download on any device','Auto-deletion reminders so you stay on top of storage'].map(item => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs flex items-center justify-center flex-shrink-0 font-bold">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── MOBILE SHOWCASE ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Works perfectly on mobile</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">Your clients can accept quotes, sign contracts, and pay invoices from any phone — no app download, no account creation required.</p>
          </div>
          <div className="flex justify-center">
            <MobilePortalMockup />
          </div>
        </div>
      </section>

      {/* ── OUR STORY ────────────────────────────────────────────────────────── */}
      <section id="our-story" className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-[#1e1247] to-[#2D1B69] rounded-3xl p-8 sm:p-14 text-white">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-4">Our Story</p>
                <h2 className="text-2xl sm:text-3xl font-extrabold mb-5 leading-snug">
                  Built by an operator,<br/>for operators.
                </h2>
                <div className="space-y-4 text-purple-100 leading-relaxed text-sm sm:text-base">
                  <p>
                    Booth Genius wasn&apos;t built in a startup incubator. It was built out of frustration — by someone who spent <strong className="text-white">over a decade running two successful photo booth businesses</strong> and got tired of juggling spreadsheets, email chains, and three different apps just to close a single booking.
                  </p>
                  <p>
                    Every feature in Booth Genius exists because it was needed in the real world: the e-signature flow because clients couldn&apos;t figure out DocuSign, the payment milestone system because deposits need to be tracked separately from balances, the guest gallery share link because clients kept accidentally forwarding their full portal — with invoice details — to wedding guests.
                  </p>
                  <p>
                    <strong className="text-white">This is the tool we wish we had when we started.</strong> Designed to make a one-person operation look as polished as a large event company, from the very first inquiry.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 w-full md:w-64 space-y-4">
                {[
                  ['10+', 'Years in the photo booth industry'],
                  ['2', 'Successful photo booth businesses operated'],
                  ['100s', 'Of real events that shaped every feature'],
                  ['1', 'Simple platform to replace them all'],
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

      {/* ── FEATURES GRID ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Everything in one place</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">Stop switching between apps. Booth Genius handles every step from inquiry to gallery delivery.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <article key={f.title} className={`bg-white rounded-2xl border p-6 hover:shadow-md transition-all group relative ${f.pro ? 'border-yellow-200 hover:border-yellow-300' : 'border-gray-100 hover:border-orange-100'}`}>
                {f.pro && <span className="absolute top-4 right-4 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 uppercase tracking-wide">Pro</span>}
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-gray-900 mb-2 text-base group-hover:text-orange-600 transition-colors">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </article>
            ))}
          </div>
          <p className="text-center text-xs text-gray-400 mt-6">Features marked <span className="font-semibold text-yellow-600">Pro</span> require a paid subscription. All other features are included in the free commission plan.</p>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Up and running in minutes</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">No technical setup. No contracts. No IT team required.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Set up in minutes', desc: 'Upload your logo, set your brand color, and connect your Stripe account. Add your services and packages. Your client portal is live immediately.' },
              { step: '02', title: 'Capture and convert leads', desc: 'Embed the inquiry form on your website. Respond, send a quote, get it signed, collect a deposit — all from one dashboard, in minutes.' },
              { step: '03', title: 'Deliver and delight', desc: 'After the event, upload photos to the gallery. Clients get a notification. Share a guest-safe gallery link. Done.' },
            ].map((s, i) => (
              <div key={s.step} className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-600 font-extrabold text-sm mb-4">{s.step}</div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">You don&apos;t make money, we don&apos;t make money</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">New operators start free with our commission plan. When your business grows, switch to flat-rate and keep more of every booking.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Commission Plan */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8 flex flex-col">
              <div className="mb-6">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold mb-4">Perfect for new operators</div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-1">Commission Plan</h3>
                <p className="text-gray-500 text-sm">Start booking without any upfront cost.</p>
              </div>
              <div className="mb-6">
                <p className="text-5xl font-extrabold text-gray-900">{pricing.commissionPct}<span className="text-2xl text-gray-400">%</span></p>
                <p className="text-sm text-gray-500 mt-1">per booking collected</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-600 mb-8 flex-1">
                {['Leads, quotes, contracts & invoices','Branded client portal & e-signatures','Stripe Connect — clients pay you directly',`Only ${pricing.commissionPct}% per booking collected`,'No monthly fee. No setup cost.','Upgrade to Pro anytime for gallery access'].map(item => (
                  <li key={item} className="flex items-center gap-2"><span className="text-orange-500 flex-shrink-0">✓</span>{item}</li>
                ))}
              </ul>
              <Link href="/sign-in" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm text-center transition-colors">Start free — no card required</Link>
            </div>
            {/* Pro Plan */}
            <div className="bg-gray-900 rounded-3xl border border-gray-800 p-8 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"/>
              <div className="mb-6 relative">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold mb-4">For busier operators</div>
                <h3 className="text-xl font-extrabold text-white mb-1">Pro Plan</h3>
                <p className="text-gray-400 text-sm">Flat rate, unlimited bookings, zero commission.</p>
              </div>
              <div className="mb-6 relative">
                {pricing.monthly
                  ? <div><p className="text-5xl font-extrabold text-white">{pricing.monthly}</p>{pricing.annual && <p className="text-sm text-gray-400 mt-1">or {pricing.annual} billed annually</p>}</div>
                  : <p className="text-2xl font-bold text-gray-300">Contact us for pricing</p>}
              </div>
              <ul className="space-y-3 text-sm text-gray-300 mb-8 flex-1 relative">
                {['Everything in Commission Plan','Zero commission on any booking','Private photo gallery & delivery','Priority support','Unlimited events & clients','White-label client portal'].map(item => (
                  <li key={item} className="flex items-center gap-2"><span className="text-orange-400 flex-shrink-0">✓</span>{item}</li>
                ))}
              </ul>
              <Link href="/sign-in" className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl text-sm text-center transition-colors relative">Get started</Link>
            </div>
          </div>
          <p className="text-center text-sm text-gray-400 mt-8">All plans include Stripe-powered payments. Your clients pay you directly — we never touch the funds.</p>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Ready to streamline your bookings?</h2>
          <p className="text-lg text-gray-500 mb-10">Join photo booth operators who have replaced spreadsheets, DocuSign, and manual invoicing with one simple platform built by someone who&apos;s been where you are.</p>
          <Link href="/sign-in" className="inline-block px-10 py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-200 hover:-translate-y-0.5">
            Create your free account →
          </Link>
          <p className="mt-4 text-sm text-gray-400">No credit card required. Commission plan is free to start.</p>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <BoothGeniusLogo size="sm" showTagline={false} />
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#features" className="hover:text-gray-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-600 transition-colors">Pricing</a>
            <a href="#our-story" className="hover:text-gray-600 transition-colors">Our Story</a>
            <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign In</Link>
          </nav>
          <p>© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
