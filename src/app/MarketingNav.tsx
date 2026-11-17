'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { BoothGenLogo } from '@/components/brand/BoothGenLogo';

// Genie (the photo booth app) and Genius (the photo booth CRM) by BoothGen
const NAV_LINKS = [
  { label: 'Genie', sub: 'Photo booth app', href: '/photo-booth-app' },
  { label: 'Genius', sub: 'Photo booth CRM', href: '/photo-booth-crm' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
  { label: 'Support', href: '/support' },
  { label: 'Contact', href: '/contact' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  // Escape closes the dropdown
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="shrink-0"><BoothGenLogo size="sm" showTagline={false} /></Link>

        {/* Full nav on laptops and up (incl. iPad landscape); the "· Photo booth app" hints only on wide screens.
            Narrower screens (phones, iPad portrait) get the menu button instead. */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-6 text-sm font-medium text-gray-600">
          {NAV_LINKS.map(l => (
            <Link key={l.label} href={l.href} className="whitespace-nowrap hover:text-gray-900 transition-colors">
              {l.label}{l.sub && <span className="hidden xl:inline ml-1 text-xs font-normal text-gray-400">· {l.sub}</span>}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Link href="/sign-in" className="whitespace-nowrap text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block">Sign in</Link>
          <Link href="/sign-up" className="whitespace-nowrap px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors">Get Genie</Link>
          {/* Menu button: phones and tablets */}
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setOpen(v => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
          </button>
        </div>
      </div>

      {/* Dropdown menu: phones and tablets */}
      {open && (
        <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-1">
          {NAV_LINKS.map(l => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              {l.label}{l.sub && <span className="ml-1 text-xs font-normal text-gray-400">· {l.sub}</span>}
            </Link>
          ))}
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
