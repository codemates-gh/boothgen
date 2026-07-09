'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { NotificationBell } from './NotificationBell';
import { SearchModal } from './SearchModal';
import { Search } from 'lucide-react';

export function TopBar({ title }: { title: string }) {
  const { data: session } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const isTeamMember = session?.tenantRole === 'TEAM_MEMBER';

  useEffect(() => {
    if (isTeamMember) return;
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isTeamMember]);

  const userName = session?.user?.name ?? '';
  const userInitials = userName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <>
      <header className="h-14 lg:h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 fixed right-0 left-0 lg:left-64 top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-[15px] lg:text-base font-semibold text-[#1F1F3D] pl-10 lg:pl-0 truncate tracking-[-0.01em]">{title}</h1>
        <div className="flex items-center gap-2">
          {!isTeamMember && (
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
          <div className="w-8 h-8 rounded-full bg-[#784BD1] flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 ml-1 cursor-pointer">
            {userInitials}
          </div>
        </div>
      </header>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
