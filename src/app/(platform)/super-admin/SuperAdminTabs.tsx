'use client';
import Link from 'next/link';
import { LayoutDashboard, Mail, Settings, FileText } from 'lucide-react';

const TABS = [
  { id: 'overview',         label: 'Overview',        icon: LayoutDashboard },
  { id: 'email-logs',       label: 'Email Logs',      icon: Mail },
  { id: 'settings',         label: 'Settings',        icon: Settings },
  { id: 'email-templates',  label: 'Email Templates', icon: FileText },
];

export default function SuperAdminTabs({ active, failedTotal }: { active: string; failedTotal: number }) {
  return (
    <div className="bg-white border-b border-gray-200 px-8 sticky top-0 z-10">
      <nav className="flex gap-0.5 -mb-px">
        {TABS.map(tab => {
          const isActive = active === tab.id;
          const showBadge = tab.id === 'email-logs' && failedTotal > 0;
          return (
            <Link
              key={tab.id}
              href={`?tab=${tab.id}`}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {showBadge && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-600 leading-none">
                  {failedTotal}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
