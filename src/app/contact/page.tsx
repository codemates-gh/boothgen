import type { Metadata } from 'next';
import Link from 'next/link';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';
import { Mail, MessageCircle, Clock, HelpCircle, Bug, CreditCard, Lightbulb, Handshake } from 'lucide-react';
import { MarketingContactForm } from '../MarketingContactForm';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Reach out to the Booth Genius team with questions, technical issues, billing inquiries, or partnership opportunities.',
  alternates: { canonical: 'https://boothgen.com/contact' },
  openGraph: {
    title: 'Contact Booth Genius',
    description: 'Reach out to the Booth Genius team with questions, technical issues, billing inquiries, or partnership opportunities.',
    url: 'https://boothgen.com/contact',
    images: [{ url: '/api/og?title=Contact+Us&subtitle=We%E2%80%99re+here+to+help', width: 1200, height: 630, alt: 'Contact Booth Genius' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Booth Genius',
    description: 'Reach out to the Booth Genius team with questions, technical issues, or partnership opportunities.',
    images: ['/api/og?title=Contact+Us&subtitle=We%E2%80%99re+here+to+help'],
  },
};

const TOPICS = [
  {
    icon: HelpCircle,
    color: 'bg-blue-50 text-blue-600 border-blue-100',
    label: 'General Question',
    desc: 'Platform features, onboarding help, or "how do I…" questions.',
  },
  {
    icon: Bug,
    color: 'bg-red-50 text-red-600 border-red-100',
    label: 'Technical Issue',
    desc: 'Something not working? Describe the problem and we\'ll investigate.',
  },
  {
    icon: CreditCard,
    color: 'bg-purple-50 text-purple-600 border-purple-100',
    label: 'Billing / Plan',
    desc: 'Questions about your plan, invoices, or upgrading to Pro.',
  },
  {
    icon: Lightbulb,
    color: 'bg-yellow-50 text-yellow-600 border-yellow-100',
    label: 'Feature Request',
    desc: 'Have an idea that would make Booth Genius even smarter?',
  },
  {
    icon: Handshake,
    color: 'bg-green-50 text-green-600 border-green-100',
    label: 'Partnership',
    desc: 'Integration partners, resellers, or affiliate opportunities.',
  },
  {
    icon: MessageCircle,
    color: 'bg-orange-50 text-orange-600 border-orange-100',
    label: 'Other',
    desc: 'Anything else — we read every message.',
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-gray-100 bg-white/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/support" className="hover:text-gray-900 transition-colors hidden sm:block">Support</Link>
            <Link href="/" className="hover:text-gray-900 transition-colors hidden sm:block">← Back to Home</Link>
            <Link href="/sign-in" className="px-4 py-1.5 bg-orange-500 text-white font-semibold rounded-lg text-sm hover:bg-orange-600 transition-colors">Sign In</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1e1247] via-[#2D1B69] to-[#1e1247] py-16 px-4 sm:px-6 text-center">
        <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-3">We&apos;re Here to Help</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Contact Us</h1>
        <p className="text-purple-200 text-base max-w-xl mx-auto">
          Questions, technical issues, billing inquiries, or just want to share feedback — send us a message and we&apos;ll get back to you.
        </p>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* Left — info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quick contact */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-4">Quick contact</h2>
              <a href="mailto:support@boothgen.com"
                className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-200 transition-colors">
                  <Mail className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Email support</p>
                  <p className="text-xs text-gray-400">support@boothgen.com</p>
                </div>
              </a>
            </div>

            {/* Response time */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Typical response time</p>
                <p className="text-xs text-blue-700 mt-0.5">We aim to reply within 1 business day. For urgent technical issues, include as much detail as possible.</p>
              </div>
            </div>

            {/* Also try */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-4">Also try</h2>
              <Link href="/support"
                className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50/50 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-200 transition-colors">
                  <HelpCircle className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Support Center</p>
                  <p className="text-xs text-gray-400">Searchable guides, workflows & AI chat</p>
                </div>
              </Link>
            </div>

            {/* Topic guide */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-4">What can we help with?</h2>
              <div className="space-y-2">
                {TOPICS.map(t => (
                  <div key={t.label} className={`flex items-start gap-3 p-3 rounded-xl border ${t.color}`}>
                    <t.icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold">{t.label}</p>
                      <p className="text-xs opacity-70 leading-snug mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Send us a message</h2>
            <MarketingContactForm />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4 text-center">
        <p className="text-sm text-gray-400">© {new Date().getFullYear()} Booth Genius. All rights reserved.</p>
        <nav className="flex flex-wrap justify-center gap-5 mt-3 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
          <Link href="/support" className="hover:text-gray-600 transition-colors">Support</Link>
          <Link href="/sign-in" className="hover:text-gray-600 transition-colors">Sign In</Link>
        </nav>
      </footer>
    </div>
  );
}
