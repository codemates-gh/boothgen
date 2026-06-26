import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { MarketingContactForm } from './MarketingContactForm';
import { MarketingNav } from './MarketingNav';

export const metadata: Metadata = {
  title: 'Booth Genius — 6 Tools. 1 Platform. Free to Start.',
  description:
    'Replace your CRM, e-signature tool, invoicing platform, photo gallery, email automation, and client portal with one Genius platform. Built by a real photo booth operator. Start free — no monthly fees.',
  openGraph: {
    title: 'Booth Genius — 6 Tools. 1 Platform. Free to Start.',
    description: 'Stop paying $100+/month for tools that don\'t talk to each other. Booth Genius replaces all of them — built by an operator who ran 2 photo booth businesses for 10+ years.',
    type: 'website',
  },
};

async function getPricing() {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ['price_display_monthly', 'commission_percentage', 'terms_content', 'privacy_content'] } } });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return {
    monthly: map.price_display_monthly || '',
    commissionPct: map.commission_percentage || '1.5',
    hasTerms: !!(map.terms_content?.trim()),
    hasPrivacy: !!(map.privacy_content?.trim()),
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
            <div className="px-3 py-2 border-b border-gray-50">
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
        <div className="flex border-b border-gray-100 px-2">
          {[['✅','Quote'],['✅','Contract'],['💳','Invoice'],['🎨','Design'],['📸','Gallery']].map(([icon, label], i) => (
            <div key={label} className={`flex items-center gap-1 px-3 py-2.5 text-[10px] font-medium border-b-2 ${i === 2 ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400'}`}>
              <span>{icon}</span><span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
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
  { icon: '📥', title: 'Embeddable Lead Capture', desc: 'One snippet on your website captures every inquiry automatically into your dashboard. No missed leads.', pro: false },
  { icon: '📄', title: 'Quotes & E-Signatures', desc: 'Send professional quotes clients can review, accept, and sign digitally — no separate e-signature subscription needed.', pro: false },
  { icon: '💳', title: 'Invoicing & Payments', desc: 'Milestone payment schedules, deposit tracking, and Stripe-powered card payments that go straight to your account.', pro: false },
  { icon: '🖼️', title: 'Branded Client Portal', desc: 'One link gives clients access to their quote, contract, invoice, and gallery — all in your brand colors.', pro: false },
  { icon: '📸', title: 'Private Photo Gallery', desc: 'Deliver event photos to clients privately. Guests get a separate share link that never exposes billing details.', pro: true },
  { icon: '🎨', title: 'Design Approval Workflow', desc: 'Share booth template designs for review before the event. Track client approvals and revision requests.', pro: false },
  { icon: '⚡', title: 'Automated Email Follow-Ups', desc: 'Email sequences triggered by inquiry, signing, and payment — your business runs follow-ups on autopilot.', pro: false },
  { icon: '👥', title: 'Team Management', desc: 'Invite staff with role-based access. They see their events; your financials and client data stay private.', pro: false },
  { icon: '📊', title: 'Business Analytics', desc: 'Revenue, conversion rates, and monthly booking trends at a glance — no spreadsheet required.', pro: false },
];

const SAVINGS_TOOLS = [
  { label: 'Event CRM — leads, events & client management', cost: '~$29/mo' },
  { label: 'Digital contract & e-signature platform', cost: '~$20/mo' },
  { label: 'Online invoicing & payment links', cost: '~$20/mo' },
  { label: 'Photo delivery & gallery platform', cost: '~$20/mo' },
  { label: 'Email automation & drip sequences', cost: '~$15/mo' },
  { label: 'Embeddable lead capture forms', cost: '~$12/mo' },
  { label: 'Branded client communication portal', cost: '~$25/mo' },
];

const GENIUS_PILLARS = [
  { label: 'Booking Genius', icon: '📥', desc: 'Lead capture → Quote → E-signature — close bookings in minutes, not days' },
  { label: 'Billing Genius', icon: '💳', desc: 'Deposits, milestone payments, and automatic reminders handled for you' },
  { label: 'Contract Genius', icon: '📄', desc: 'Professional contracts with typed digital signatures — no third-party tool needed' },
  { label: 'Gallery Genius', icon: '📸', desc: 'Private photo delivery with guest-safe sharing that keeps your invoices hidden' },
  { label: 'Portal Genius', icon: '🖼️', desc: 'One branded link where clients manage everything — no account creation needed' },
  { label: 'Automation Genius', icon: '⚡', desc: 'Email sequences that follow up, remind, and nurture — while you run events' },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.userId) {
    if (session.globalRole === 'SUPER_ADMIN') redirect('/super-admin');
    if (!session.tenantId) redirect('/onboarding');
    redirect('/dashboard');
  }

  const pricing = await getPricing();
  const totalSavings = 141;

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <MarketingNav />

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247] pt-16 pb-20 px-4 sm:px-6">
        {/* Decorative glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"/>
        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            {/* Text */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/20 text-orange-300 text-xs font-bold uppercase tracking-wide mb-6 border border-orange-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse inline-block"/>
                The Genius way to run a photo booth business
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5">
                6 tools.<br/>
                1 platform.<br/>
                <span className="text-orange-400">That&apos;s the Genius of it.</span>
              </h1>
              <p className="text-lg text-purple-200 mb-8 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Stop paying $100+/month for tools that don&apos;t talk to each other. Booth Genius replaces your CRM, e-signatures, invoicing, photo gallery, email automation, and client portal — in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/sign-up" className="px-7 py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">
                  Start free — no credit card
                </Link>
                <a href="#savings" className="px-7 py-3.5 bg-white/10 border border-white/20 hover:bg-white/15 text-white font-semibold rounded-2xl text-base transition-all">
                  See how much you save →
                </a>
              </div>
              <p className="mt-4 text-xs text-purple-300">Commission-based — we only earn when you do.</p>
            </div>
            {/* Dashboard mockup */}
            <div className="flex-1 w-full max-w-lg lg:max-w-none">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── GENIUS PILLARS ───────────────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-white py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {GENIUS_PILLARS.map(p => (
              <div key={p.label} className="text-center group">
                <div className="text-2xl mb-2">{p.icon}</div>
                <p className="text-xs font-bold text-gray-900 mb-1 group-hover:text-orange-600 transition-colors">{p.label}</p>
                <p className="text-[10px] text-gray-400 leading-snug hidden lg:block">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SAVINGS COMPARISON ───────────────────────────────────────────────── */}
      <section id="savings" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Why Genius?</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
              Most operators are paying<br/><span className="text-red-500">${totalSales(totalSavings)}+/month</span> for tools that barely talk to each other.
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              To run a photo booth business you need a CRM, digital contracts, invoicing, photo delivery, email automation, and a client portal. Here&apos;s what that costs when you buy them separately — and what Genius operators pay instead.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Old way */}
            <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden">
              <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
                <span className="text-2xl">😤</span>
                <div>
                  <p className="font-extrabold text-gray-900">The Old Way</p>
                  <p className="text-xs text-gray-500">Patching together 6+ separate subscriptions</p>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {SAVINGS_TOOLS.map(t => (
                  <div key={t.label} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-red-400 flex-shrink-0 text-sm font-bold">✗</span>
                      <span className="text-sm text-gray-600">{t.label}</span>
                    </div>
                    <span className="text-sm font-bold text-red-500 flex-shrink-0 ml-4">{t.cost}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 bg-red-50 border-t border-red-100 flex items-center justify-between">
                <p className="font-bold text-gray-900">Total monthly spend</p>
                <p className="text-2xl font-extrabold text-red-500">${totalSavings}+<span className="text-sm font-medium text-red-400">/mo</span></p>
              </div>
            </div>

            {/* Genius way */}
            <div className="bg-gradient-to-br from-[#1e1247] to-[#2D1B69] rounded-3xl overflow-hidden border border-purple-900/50">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
                <span className="text-2xl">🧠</span>
                <div>
                  <p className="font-extrabold text-white">The Genius Way</p>
                  <p className="text-xs text-purple-300">One platform. Every tool. Built-in.</p>
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {SAVINGS_TOOLS.map(t => (
                  <div key={t.label} className="flex items-center justify-between px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="text-orange-400 flex-shrink-0 text-sm font-bold">✓</span>
                      <span className="text-sm text-purple-100">{t.label}</span>
                    </div>
                    <span className="text-sm font-bold text-green-400 flex-shrink-0 ml-4">Included</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white">Commission Plan</p>
                  <p className="text-xs text-purple-300">Pay only when you collect</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold text-orange-400">$0<span className="text-sm font-medium text-orange-300">/mo</span></p>
                  <p className="text-[10px] text-purple-300">to start</p>
                </div>
              </div>
              <div className="px-6 pb-6">
                <Link href="/sign-up" className="block w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm text-center transition-colors">
                  Start saving today — free →
                </Link>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">Estimates based on typical individual tool pricing. Actual savings vary. Commission plan collects a small % per booking — no monthly fee.</p>
        </div>
      </section>

      {/* ── CLIENT PORTAL SHOWCASE ───────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 w-full max-w-lg">
              <PortalMockup />
            </div>
            <div className="flex-1 lg:pl-8">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Portal Genius</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                One link.<br/>Everything your client needs.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Your clients get a single, mobile-friendly portal — branded with your logo — where they can review their quote, sign the contract, pay their invoice, and download their gallery. No app download. No account required.
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
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Contract Genius</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                Send a proposal.<br/>Get a signature. Get paid.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Build quotes from your saved packages, send them in seconds, and let clients accept and sign digitally — all without leaving your dashboard, and without paying for a separate e-signature subscription.
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
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500">Gallery Genius</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 uppercase tracking-wide">Pro</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                Deliver photos<br/>without a second subscription.
              </h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Skip the standalone photo delivery platform. Upload event photos directly from your Booth Genius dashboard. Clients view and download privately. Guests get a completely separate link — your client&apos;s billing details stay hidden.
              </p>
              <ul className="space-y-3 text-sm text-gray-700">
                {['Bulk upload hundreds of photos at once','Password-protected access code option','Guest-safe share link — never exposes invoice or quote','Lightbox viewer with download on any device','Auto-deletion reminders so you never lose track'].map(item => (
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
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Works perfectly on every phone</h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">Your clients can accept quotes, sign contracts, pay invoices, and download galleries from any device — no app, no account, no friction.</p>
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
                    Every feature exists because it was needed in the real world: the e-signature flow because clients couldn&apos;t figure out a third-party signing tool, the payment milestone system because deposits and balances need to be tracked separately, the guest gallery share link because clients kept accidentally forwarding their full portal — invoice and all — to wedding guests.
                  </p>
                  <p>
                    When you&apos;re running events, chasing payments, and trying to deliver photos, the last thing you need is to log into four different platforms. <strong className="text-white">That&apos;s the Genius of it — everything in one place, built by someone who&apos;s been exactly where you are.</strong>
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 w-full md:w-64 space-y-4">
                {[
                  ['10+', 'Years in the photo booth industry'],
                  ['2', 'Successful businesses operated'],
                  ['100s', 'Of real events that shaped every feature'],
                  ['1', 'Genius platform to replace them all'],
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
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Everything Included</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">Six tools. One Genius platform.</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">Stop app-hopping. Booth Genius handles every step from first inquiry to final photo delivery — and everything in between.</p>
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
            <p className="text-lg text-gray-500 max-w-xl mx-auto">No technical setup. No contracts. No IT team. Just a smarter way to run your business.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Set up your Genius HQ', desc: 'Upload your logo, set your brand color, connect Stripe, and add your packages. Your client portal is live in minutes — no developer needed.' },
              { step: '02', title: 'Capture, quote & book', desc: 'Embed the inquiry form on your website. Respond with a quote, get it signed, collect a deposit — all from one dashboard, in minutes not days.' },
              { step: '03', title: 'Deliver & delight', desc: 'After the event, upload photos directly in Booth Genius. Clients get a notification. Share a guest-safe gallery link. You&apos;re done.' },
            ].map((s) => (
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
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-3">Genius Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">You don&apos;t make money,<br/>we don&apos;t make money.</h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">New operators start free with our commission plan. When your business grows and you&apos;re booking more events, switch to flat-rate and keep every dollar.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Commission Plan */}
            <div className="bg-white rounded-3xl border border-gray-200 p-8 flex flex-col">
              <div className="mb-6">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold mb-4">Perfect for new operators</div>
                <h3 className="text-xl font-extrabold text-gray-900 mb-1">Commission Plan</h3>
                <p className="text-gray-500 text-sm">Get started without spending a dollar upfront.</p>
              </div>
              <div className="mb-6">
                <p className="text-5xl font-extrabold text-gray-900">{pricing.commissionPct}<span className="text-2xl text-gray-400">%</span></p>
                <p className="text-sm text-gray-500 mt-1">per booking collected — nothing else</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-600 mb-8 flex-1">
                {[
                  'Full CRM — leads, events & clients',
                  'Quotes & digital e-signatures included',
                  'Invoicing & milestone payments',
                  'Branded client portal',
                  'Email automation & follow-ups',
                  `Only ${pricing.commissionPct}% per booking — no monthly fee`,
                  'Upgrade to Pro anytime for gallery access',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2"><span className="text-orange-500 flex-shrink-0">✓</span>{item}</li>
                ))}
              </ul>
              <Link href="/sign-up" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm text-center transition-colors">Start free — no card required</Link>
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
                  ? <p className="text-5xl font-extrabold text-white">{pricing.monthly}</p>
                  : <p className="text-2xl font-bold text-gray-300">Contact us for pricing</p>}
              </div>
              <ul className="space-y-3 text-sm text-gray-300 mb-8 flex-1 relative">
                {[
                  'Everything in Commission Plan',
                  'Zero commission on every booking',
                  'Private photo gallery & delivery (Gallery Genius)',
                  'Priority support',
                  'Unlimited events & clients',
                  'White-label client portal',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2"><span className="text-orange-400 flex-shrink-0">✓</span>{item}</li>
                ))}
              </ul>
              <Link href="/sign-up" className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-xl text-sm text-center transition-colors relative">Get started with Pro</Link>
              <Link href="/pricing" className="block text-center text-xs text-gray-500 hover:text-orange-400 mt-3 transition-colors relative">See full pricing breakdown & savings calculator →</Link>
            </div>
          </div>
          <p className="text-center text-sm text-gray-400 mt-8">All plans include Stripe-powered payments. Your clients pay you directly — Booth Genius never touches your funds.</p>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-4">Ready to run your business like a Genius?</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Replace your toolbox.<br/>Keep what matters.</h2>
          <p className="text-lg text-purple-200 mb-10">Stop juggling subscriptions built for someone else. Booth Genius was built by an operator who knows what you actually need — and packed it into one platform you can start using today for free.</p>
          <Link href="/sign-up" className="inline-block px-10 py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-2xl text-base transition-all shadow-lg shadow-orange-500/30 hover:-translate-y-0.5">
            Create your free Genius account →
          </Link>
          <p className="mt-4 text-sm text-purple-300">No credit card required. Commission plan is free to start.</p>
        </div>
      </section>

      {/* ── CONTACT US ───────────────────────────────────────────────────────── */}
      <section id="contact" className="py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-2">Get in Touch</p>
            <h2 className="text-3xl font-extrabold text-gray-900 mb-3">Contact Us</h2>
            <p className="text-gray-500">Have a question, technical issue, or just want to say hi? Send us a message and we&apos;ll get back to you quickly.</p>
            <p className="text-sm text-gray-400 mt-2">
              Need more details? Visit our <Link href="/contact" className="text-orange-500 hover:underline font-medium">full contact page →</Link>
            </p>
          </div>
          <MarketingContactForm />
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <BoothGeniusLogo size="sm" showTagline={false} />
            <p className="text-[11px] text-gray-400">The Genius way to run your photo booth business.</p>
          </div>
          <nav className="flex flex-wrap justify-center gap-6">
            <a href="#savings" className="hover:text-gray-600 transition-colors">Why Genius?</a>
            <a href="#features" className="hover:text-gray-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-600 transition-colors">Pricing</a>
            <a href="#our-story" className="hover:text-gray-600 transition-colors">Our Story</a>
            <Link href="/support" className="hover:text-gray-600 transition-colors">Support</Link>
            <Link href="/contact" className="hover:text-gray-600 transition-colors">Contact</Link>
            <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign In</Link>
            {pricing.hasTerms && <Link href="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>}
            {pricing.hasPrivacy && <Link href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>}
          </nav>
          <p>© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}

function totalSales(n: number) { return n; }
