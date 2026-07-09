'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, Menu, X, Inbox, BarChart2, CalendarDays, MessageSquare } from 'lucide-react';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';
import { APP_VERSION } from '@/lib/version';

type NavItem = { href: string; label: string; icon: any; pro?: boolean };
type NavSection = { label: string; items: NavItem[] };

const adminSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/events', label: 'Events', icon: Calendar },
    ],
  },
  {
    label: 'Clients',
    items: [
      { href: '/clients', label: 'Clients', icon: Users },
      { href: '/leads', label: 'Leads', icon: Inbox },
      { href: '/messages', label: 'Messages', icon: MessageSquare },
    ],
  },
  {
    label: 'Financial',
    items: [
      { href: '/quotes', label: 'Quotes', icon: FileText },
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/contracts', label: 'Contracts', icon: FileText },
    ],
  },
  {
    label: 'Delivery & Ops',
    items: [
      { href: '/gallery', label: 'Gallery', icon: Camera, pro: true },
      { href: '/analytics', label: 'Analytics', icon: BarChart2 },
      { href: '/automation', label: 'Automation', icon: Zap },
    ],
  },
];

// Flat list for team member nav (no sections needed)
const adminNav: NavItem[] = adminSections.flatMap(s => s.items);

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

function NavLink({ href, label, Icon, pro, active, close }: { href: string; label: string; Icon: any; pro?: boolean; active: boolean; close: () => void }) {
  return (
    <Link
      href={href}
      onClick={close}
      className={cn(
        'flex items-center gap-3 py-2.5 rounded-r-lg text-sm font-medium mb-0.5 transition-all group',
        'border-l-[3px] pl-[9px] pr-3',
        active
          ? 'bg-white/10 text-white border-white/80'
          : 'text-sidebar-text hover:bg-white/[0.05] hover:text-white border-transparent'
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', active ? 'text-white' : 'text-sidebar-text group-hover:text-white/80')} />
      {label}
      {pro && <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-yellow-400/20 text-yellow-300 tracking-wide">PRO</span>}
    </Link>
  );
}

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
        <div className="px-4 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <BoothGeniusIcon size={32} />
            <p className="text-white font-semibold text-sm leading-tight truncate flex-1">{displayName}</p>
            <button onClick={close} className="lg:hidden text-white/50 hover:text-white" aria-label="Close menu">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <nav className="pr-3 py-4 flex-1">
          {isTeamMember ? (
            nav.map(({ href, label, icon: Icon, pro }) => {
              const active = path === href || (path.startsWith(href + '/') && !nav.some(item => item.href !== href && (path === item.href || path.startsWith(item.href + '/'))));
              return (
                <NavLink key={href} href={href} label={label} Icon={Icon} pro={pro} active={active} close={close} />
              );
            })
          ) : (
            adminSections.map((section, si) => (
              <div key={section.label} className={si > 0 ? 'mt-4' : ''}>
                <p className="pl-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">{section.label}</p>
                {section.items.map(({ href, label, icon: Icon, pro }) => {
                  const allItems = adminNav;
                  const active = path === href || (path.startsWith(href + '/') && !allItems.some(item => item.href !== href && (path === item.href || path.startsWith(item.href + '/'))));
                  return (
                    <NavLink key={href} href={href} label={label} Icon={Icon} pro={pro} active={active} close={close} />
                  );
                })}
              </div>
            ))
          )}
        </nav>
        <div className="pr-3 pb-4 shrink-0">
          {!isTeamMember && (
            <>
              <NavLink
                href="/settings"
                label="Settings"
                Icon={Settings}
                active={path === '/settings' || path.startsWith('/settings/')}
                close={close}
              />
              <div className="border-t border-white/10 my-3 ml-3" />
            </>
          )}
          {session?.user && (
            <div className="px-3 py-2 mb-1">
              <p className="text-white text-xs font-medium truncate">{session.user.name}</p>
              <p className="text-sidebar-text text-[10px] truncate">{session.user.email}</p>
            </div>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/sign-in' })}
            className="flex items-center gap-3 pl-[9px] pr-3 py-2 rounded-r-lg text-sm font-medium text-sidebar-text hover:bg-white/[0.05] hover:text-white w-full transition-colors border-l-[3px] border-transparent"
          >
            <LogOut className="w-4 h-4" />Sign Out
          </button>
          <p className="text-sidebar-text text-[10px] pl-3 pt-2 opacity-30">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
