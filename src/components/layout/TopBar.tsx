'use client';
import { useState, useEffect } from 'react';
import { NotificationBell } from './NotificationBell';
import { SearchModal } from './SearchModal';
import { Search } from 'lucide-react';

export function TopBar({ title }: { title: string }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="h-14 lg:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 fixed right-0 left-0 lg:left-64 top-0 z-30">
        <h1 className="text-base lg:text-xl font-semibold text-gray-900 pl-10 lg:pl-0 truncate">{title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
            <kbd className="ml-1 px-1 py-0.5 bg-white border border-gray-200 rounded text-xs font-mono text-gray-400">⌘K</kbd>
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            className="sm:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          <NotificationBell />
        </div>
      </header>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
