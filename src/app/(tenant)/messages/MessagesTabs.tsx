'use client';
// Messages: Sent (emails sent to clients from events and leads; replies go to the operator's own inbox), Automations (when emails go out) and Templates (what they say)
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [
  ['/messages', 'Sent'],
  ['/messages/automations', 'Automations'],
  ['/messages/templates', 'Templates'],
];

export default function MessagesTabs() {
  const path = usePathname();
  return (
    <div className="flex flex-wrap border-b border-gray-200">
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
