'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, ChevronRight, Mail, Menu, X, Inbox } from 'lucide-react';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';
import { APP_VERSION } from '@/lib/version';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/quotes', label: 'Quotes', icon: FileText },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/gallery', label: 'Gallery', icon: Camera },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/automation/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const teamMemberNav = [
  { href: '/events', label: 'Events', icon: Calendar },
];

export function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const close = () => setIsOpen(false);

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setCompanyName(d.companyName ?? '');
        }
      });
  }, []);

  const displayName = companyName || session?.tenant?.name || 'Loading...';
  const isTeamMember = session?.tenantRole === 'TEAM_MEMBER';
  const nav = isTeamMember ? teamMemberNav : adminNav;

  return (
    <>
      {!isOpen && (
        <button
          className="fixed top-0 left-0 h-14 w-14 z-40 lg:hidden flex items-center justify-center text-gray-500 hover:text-gray-700"
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
        />
      )}
      <aside className={cn(
        'w-64 h-screen bg-canvas flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <BoothGeniusIcon size={36} />
            </div>
            <p className="text-white font-bold text-sm leading-tight truncate flex-1">{displayName}</p>
            <button onClick={close} className="lg:hidden text-white/60 hover:text-white ml-auto" aria-label="Close menu">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = path === href || (
              path.startsWith(href + '/') &&
              !nav.some(item => item.href !== href && (path === item.href || path.startsWith(item.href + '/')))
            );
            return (
              <Link
                key={href}
                href={href}
                onClick={close}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors group',
                  active ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-brand' : 'text-sidebar-text group-hover:text-brand')} />
                {label}
                {active && <ChevronRight className="w-3 h-3 ml-auto text-brand" />}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-white/10">
          {session?.user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-white text-xs font-medium truncate">{session.user.name}</p>
              <p className="text-sidebar-text text-xs truncate">{session.user.email}</p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/sign-in' })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />Sign Out
          </button>
          <p className="text-sidebar-text text-xs px-3 pt-2 opacity-40">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
