'use client';
import { Bell, Menu } from 'lucide-react';
import { useSidebar } from './sidebar-context';

export function TopBar({ title }: { title: string }) {
  const { open } = useSidebar();
  return (
    <header className="h-14 lg:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 fixed right-0 left-0 lg:left-64 top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={open}
          className="lg:hidden text-gray-500 hover:text-gray-700 p-1 rounded"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg lg:text-xl font-semibold text-gray-900">{title}</h1>
      </div>
      <button className="text-gray-400 hover:text-gray-600">
        <Bell className="w-5 h-5" />
      </button>
    </header>
  );
}
