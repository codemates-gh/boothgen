'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, ChevronRight, Mail, Menu, X, Inbox, BarChart2, CalendarDays, MessageSquare } from 'lucide-react';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';
import { APP_VERSION } from '@/lib/version';

type NavItem = { href: string; label: string; icon: any; pro?: boolean };

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/quotes', label: 'Quotes', icon: FileText },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/gallery', label: 'Gallery', icon: Camera, pro: true },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/automation/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

// All possible team member nav items keyed by module ID
const TEAM_NAV_MAP: Record<string, NavItem> = {
  events:   { href: '/events',  label: 'Events',          icon: Calendar },
  calendar: { href: '/calendar',label: 'Calendar',        icon: CalendarDays },
  leads:    { href: '/leads',   label: 'Leads',icon: Inbox },
  quotes:   { href: '/quotes',  label: 'Quotes',          icon: FileText },
  invoices: { href: '/invoices',label: 'Invoices',        icon: Receipt },
  clients:  { href: '/clients', label: 'Clients',         icon: Users },
  gallery:  { href: '/gallery', label: 'Gallery',         icon: Camera, pro: true },
};

export function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [companyName, setCompanyName] = useState<string>('');
  const [teamMemberAccess, setTeamMemberAccess] = useState<string[]>(['events']);
  const close = () => setIsOpen(false);

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) {
          setCompanyName(d.companyName ?? '');
          if (d.teamMemberAccess) {
            try { setTeamMemberAccess(JSON.parse(d.teamMemberAccess)); } catch { /* keep default */ }
          }
        }
      });
  }, []);

  const displayName = companyName || session?.tenant?.name || 'Loading...';
  const isTeamMember = session?.tenantRole === 'TEAM_MEMBER';

  const teamNav: NavItem[] = teamMemberAccess
    .map(id => TEAM_NAV_MAP[id])
    .filter(Boolean);

  const nav = isTeamMember ? teamNav : adminNav;

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
        'w-64 h-screen bg-canvas flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out overflow-y-auto',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="px-6 py-5 border-b border-white/10 shrink-0">
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
        <nav className="px-3 py-4 flex-1">
          {nav.map(({ href, label, icon: Icon, pro }) => {
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
                {pro && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-300 tracking-wide">PRO</span>}
                {active && !pro && <ChevronRight className="w-3 h-3 ml-auto text-brand" />}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-white/10 shrink-0">
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
