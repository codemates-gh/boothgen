'use client';
// Settings menu, grouped (Account, Business, Sales, Events): a side menu on wide screens, a grouped dropdown on phones
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { settingsGroups } from '@/lib/product';

export default function SettingsNav() {
  const path = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const groups = settingsGroups(session?.tenant?.product);
  const current = path.split('/')[2] ?? '';

  return (
    <>
      {/* Phones and tablets: one grouped dropdown */}
      <div className="lg:hidden px-4 sm:px-8 pt-4 sm:pt-6">
        <label htmlFor="settings-section" className="sr-only">Settings section</label>
        <select
          id="settings-section"
          value={current}
          onChange={e => router.push('/settings/' + e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-[#1F1F3D] focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30"
        >
          {groups.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map(([href, label]) => <option key={href} value={href}>{label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Wide screens: side menu with group headings */}
      <nav aria-label="Settings" className="hidden lg:block w-56 flex-shrink-0 self-start sticky top-16 pl-8 py-8 space-y-5">
        {groups.map(g => (
          <div key={g.label}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
            {g.items.map(([href, label]) => {
              const active = href === current;
              return (
                <Link
                  key={href}
                  href={'/settings/' + href}
                  aria-current={active ? 'page' : undefined}
                  className={'block rounded-lg px-3 py-2 text-sm transition-colors ' + (active ? 'bg-white text-[#1F1F3D] font-semibold shadow-sm border border-gray-200' : 'text-[#676879] hover:bg-gray-100 hover:text-[#1F1F3D] border border-transparent')}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
