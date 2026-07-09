'use client';
import Link from 'next/link';
import { LayoutDashboard, Users, CreditCard, Mail, FileText, Settings, BookOpen, BarChart2 } from 'lucide-react';

const TABS = [
  { id: 'overview',          label: 'Overview',           icon: LayoutDashboard },
  { id: 'analytics',         label: 'Analytics',          icon: BarChart2 },
  { id: 'operators',         label: 'Operators',          icon: Users },
  { id: 'payment',           label: 'Payment Processing', icon: CreditCard },
  { id: 'email-logs',        label: 'Email Logs',         icon: Mail },
  { id: 'email-templates',   label: 'Email Templates',    icon: FileText },
  { id: 'blog',              label: 'Blog',               icon: BookOpen },
  { id: 'settings',          label: 'Settings',           icon: Settings },
];

export default function SuperAdminTabs({ active, failedTotal }: { active: string; failedTotal: number }) {
  return (
    <div className="bg-white border-b border-gray-200 px-8 sticky top-0 z-10 overflow-x-auto">
      <nav className="flex gap-0.5 -mb-px min-w-max">
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
