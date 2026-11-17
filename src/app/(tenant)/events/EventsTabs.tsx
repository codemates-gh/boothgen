'use client';
// Events area: Events plus every Quote, Contract, Invoice and Gallery across events (these left the sidebar; each event page
// also links here with "View all")
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

const TABS: [string, string][] = [
  ['/events', 'Events'],
  ['/quotes', 'Quotes'],
  ['/contracts', 'Contracts'],
  ['/invoices', 'Invoices'],
  ['/gallery', 'Gallery'],
];

export default function EventsTabs({ className = 'mb-6' }: { className?: string }) {
  const path = usePathname();
  const { data: session } = useSession();
  // Team members only have Events; Genie-only accounts have no quotes, contracts or invoices
  if (session?.tenantRole === 'TEAM_MEMBER' || session?.tenant?.product === 'genie') return null;
  return (
    <div className={'flex flex-wrap border-b border-gray-200 ' + className}>
      {TABS.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (path === href ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
