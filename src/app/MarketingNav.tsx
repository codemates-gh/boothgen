'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { BoothGeniusLogo } from '@/components/brand/BoothGeniusLogo';

const NAV_LINKS = [
  { label: 'Why Genius?', href: '#savings' },
  { label: 'Features',    href: '#features' },
  { label: 'Pricing',     href: '/pricing' },
  { label: 'Our Story',   href: '#our-story' },
  { label: 'Support',     href: '/support', external: false },
  { label: 'Contact',     href: '#contact' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/"><BoothGeniusLogo size="sm" showTagline={false} /></Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          {NAV_LINKS.map(l =>
            l.href.startsWith('/') ? (
              <Link key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</Link>
            ) : (
              <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</a>
            )
          )}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block">Sign in</Link>
          <Link href="/sign-up" className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">Get Started Free</Link>
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(v => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          {NAV_LINKS.map(l =>
            l.href.startsWith('/') ? (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                {l.label}
              </a>
            )
          )}
          <div className="pt-2 border-t border-gray-100 mt-2">
            <Link
              href="/sign-in"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
