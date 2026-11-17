'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { NotificationBell } from './NotificationBell';
import { SearchModal } from './SearchModal';
import { Search, LogOut, Settings } from 'lucide-react';
import Image from 'next/image';

export function TopBar({ title }: { title: string }) {
  const { data: session } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isTeamMember = session?.tenantRole === 'TEAM_MEMBER';
  // Search covers CRM records (clients, events, invoices), which Genie-only accounts don't have
  const noSearch = isTeamMember || session?.tenant?.product === 'genie';

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => { if (d && !d.error) setLogoUrl(d.logoUrl || ''); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const url = (e as CustomEvent<{ logoUrl: string | null }>).detail.logoUrl;
      setLogoUrl(url || '');
    }
    window.addEventListener('branding:logo-updated', handler);
    return () => window.removeEventListener('branding:logo-updated', handler);
  }, []);

  useEffect(() => {
    if (noSearch) return;
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [noSearch]);

  // Account menu under the avatar: close on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const userName = session?.user?.name ?? '';
  const userInitials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <>
      <header className="h-14 lg:h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 fixed right-0 left-0 lg:left-64 top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-[15px] lg:text-base font-semibold text-[#1F1F3D] pl-10 lg:pl-0 truncate tracking-[-0.01em]">{title}</h1>
        <div className="flex items-center gap-2">
          {!noSearch && (
            <>
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-[#676879] bg-[#F5F6F8] hover:bg-gray-200 rounded-lg transition-colors border border-gray-200"
                title="Search (⌘K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="text-[13px]">Search</span>
                <kbd className="ml-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono text-gray-400">⌘K</kbd>
              </button>
              <button
                onClick={() => setSearchOpen(true)}
                className="sm:hidden p-2 text-[#676879] hover:text-[#1F1F3D] rounded-lg hover:bg-[#F5F6F8] transition-colors"
                title="Search"
              >
                <Search className="w-4.5 h-4.5" />
              </button>
            </>
          )}
          <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(o => !o)} className="flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#784BD1]/40" aria-label="Account menu" aria-expanded={menuOpen}>
              {logoUrl ? (
                <Image src={logoUrl} alt="Company logo" width={120} height={40} className="h-10 w-auto flex-shrink-0 ml-2 object-contain" unoptimized />
              ) : (
                <span className="w-8 h-8 rounded-full bg-[#784BD1] flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 ml-1">
                  {userInitials}
                </span>
              )}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-gray-200 bg-white shadow-card-md py-1.5 z-50">
                {session?.user && (
                  <div className="px-4 py-2 border-b border-gray-100 mb-1">
                    <p className="text-sm font-medium text-[#1F1F3D] truncate">{session.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{session.user.email}</p>
                  </div>
                )}
                {!isTeamMember && (
                  <Link href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    <Settings className="w-4 h-4 text-gray-400" />Settings
                  </Link>
                )}
                <button onClick={() => signOut({ callbackUrl: '/sign-in' })} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <LogOut className="w-4 h-4 text-gray-400" />Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
