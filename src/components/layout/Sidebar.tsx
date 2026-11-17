'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Camera, Menu, X, Inbox, BarChart2, CalendarDays, MessageSquare, Star, Tablet, LayoutTemplate, Send, CalendarCheck, SlidersHorizontal, Smile, Image as ImageIcon, Sparkles, BookOpen } from 'lucide-react';
import { BoothGenIcon } from '@/components/brand/BoothGenLogo';
import { APP_VERSION } from '@/lib/version';

type NavItem = { href: string; label: string; icon: any; pro?: boolean };
type NavSection = { label: string; items: NavItem[] };

const adminSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    // Everything about a booking, from first inquiry to delivery (Events has Quotes, Contracts, Invoices and Gallery tabs)
    label: 'Projects',
    items: [
      { href: '/leads', label: 'Leads', icon: Inbox },
      { href: '/clients', label: 'Clients', icon: Users },
      { href: '/events', label: 'Events', icon: Calendar },
      { href: '/messages', label: 'Messages', icon: MessageSquare },
    ],
  },
  {
    label: 'Templates',
    items: [
      { href: '/templates', label: 'Layouts', icon: LayoutTemplate },
      { href: '/templates/settings', label: 'Template Settings', icon: SlidersHorizontal },
    ],
  },
];

// Last in the menu (after Genie); planned to grow into bookkeeping
const insightsSection: NavSection = {
  label: 'Insights',
  items: [
    { href: '/analytics', label: 'Analytics', icon: BarChart2 },
    { href: '/bookkeeping', label: 'Bookkeeping', icon: BookOpen },
  ],
};

// Shown only to tenants with the Genie add-on
const genieSection: NavSection = {
  label: 'Genie',
  items: [
    { href: '/genie/events', label: 'Events', icon: CalendarCheck },
    { href: '/genie/defaults', label: 'Event Defaults', icon: SlidersHorizontal },
    { href: '/genie/props', label: 'Props', icon: Smile },
    { href: '/genie/backdrops', label: 'Backdrops', icon: ImageIcon },
    { href: '/genie/devices', label: 'Devices', icon: Tablet },
    { href: '/genie/sharing', label: 'Guest Sharing', icon: Send },
  ],
};

// Genie-only accounts: the booth, its designs and galleries; no CRM (src/lib/product.ts)
// Same groups and order as the Genius menu (Templates, then Genie) so switching between them isn't confusing.
// Gallery sits after Events, where Genius has it as an Events tab.
const genieOnlySections: NavSection[] = [
  {
    label: 'Templates',
    items: [
      { href: '/templates', label: 'Layouts', icon: LayoutTemplate },
      { href: '/templates/settings', label: 'Template Settings', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'Genie',
    items: [
      { href: '/genie/events', label: 'Events', icon: CalendarCheck },
      { href: '/gallery', label: 'Gallery', icon: Camera },
      { href: '/genie/defaults', label: 'Event Defaults', icon: SlidersHorizontal },
      { href: '/genie/props', label: 'Props', icon: Smile },
      { href: '/genie/backdrops', label: 'Backdrops', icon: ImageIcon },
      { href: '/genie/devices', label: 'Devices', icon: Tablet },
      { href: '/genie/sharing', label: 'Guest Sharing', icon: Send },
    ],
  },
];
const genieOnlyNav: NavItem[] = genieOnlySections.flatMap(s => s.items);

// Flat list for team member nav (no sections needed)
const adminNav: NavItem[] = [...adminSections, insightsSection].flatMap(s => s.items);

// All possible team member nav items keyed by module ID
const TEAM_NAV_MAP: Record<string, NavItem> = {
  events:   { href: '/events',  label: 'Events',          icon: Calendar },
  calendar: { href: '/calendar',label: 'Calendar',        icon: CalendarDays },
  leads:    { href: '/leads',   label: 'Leads',icon: Inbox },
  quotes:   { href: '/quotes',  label: 'Quotes',          icon: FileText },
  invoices: { href: '/invoices',label: 'Invoices',        icon: Receipt },
  clients:  { href: '/clients', label: 'Clients',         icon: Users },
  gallery:  { href: '/gallery', label: 'Gallery',         icon: Camera },
};

function NavLink({ href, label, Icon, pro, active, close, count }: { href: string; label: string; Icon: any; pro?: boolean; active: boolean; close: () => void; count?: number }) {
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
      {!!count && <span className="ml-auto min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#E2445C] text-white leading-none">{count}</span>}
    </Link>
  );
}

export function Sidebar({ isFoundingMember, genieEnabled, genieOnly }: { isFoundingMember?: boolean; genieEnabled?: boolean; genieOnly?: boolean }) {
  const rawPath = usePathname();
  // Quotes, Contracts and Invoices live under Events (tabs on the Events page), so Events stays highlighted there
  // Quotes, Contracts, Invoices and Gallery are tabs under Events, so Events stays highlighted there
  // (Genie-only accounts keep Gallery as its own menu item)
  const path = (genieOnly ? /^\/(quotes|contracts|invoices)(\/|$)/ : /^\/(quotes|contracts|invoices|gallery)(\/|$)/).test(rawPath) ? '/events' : rawPath;
  const { data: session, update: updateSession } = useSession();
  // The menu comes from the database; the browser session can lag after Super Admin switches the account (Genius ↔
  // Genie only). Refresh it so Search, the settings tabs and the middleware agree with the menu.
  const sessionGenieOnly = session?.tenant?.product === 'genie';
  const synced = useRef(false); // once per page load, so a mismatch that doesn't clear can't loop
  useEffect(() => {
    if (synced.current || !session || genieOnly === undefined || genieOnly === sessionGenieOnly) return;
    synced.current = true;
    updateSession();
  }, [session, genieOnly, sessionGenieOnly, updateSession]);
  const [isOpen, setIsOpen] = useState(false);
  const [teamMemberAccess, setTeamMemberAccess] = useState<string[]>(['events']);
  const close = () => setIsOpen(false);


  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error && d.teamMemberAccess) {
          try { setTeamMemberAccess(JSON.parse(d.teamMemberAccess)); } catch { /* keep default */ }
        }
      });
  }, []);
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
        'w-64 h-dvh bg-canvas flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out overflow-y-auto',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="px-4 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <Link href={isTeamMember ? '/events' : '/dashboard'} onClick={close} className="flex items-center gap-3 flex-1 min-w-0" aria-label="Home">
              <BoothGenIcon size={32} />
              <p className="text-white font-semibold text-sm leading-tight truncate">Booth<span className="text-[#F7B731]">Gen</span></p>
            </Link>
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
            (genieOnly ? genieOnlySections : genieEnabled ? [...adminSections, genieSection, insightsSection] : [...adminSections, insightsSection]).map((section, si) => (
              <div key={section.label} className={si > 0 ? 'mt-4' : ''}>
                <p className="pl-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">{section.label}</p>
                {section.items.map(({ href, label, icon: Icon, pro }) => {
                  const allItems = genieOnly ? genieOnlyNav : adminNav;
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
          {/* Reports, Settings and Sign Out are in the account menu under the avatar (top right) */}
          {/* Genie-only accounts: call to action for the CRM */}
          {genieOnly && (
            <Link
              href="/upgrade"
              onClick={close}
              className={'group block ml-3 mb-2 rounded-xl p-3.5 bg-gradient-to-br from-[#784BD1] to-[#F97316] text-white shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 ' + (path === '/upgrade' ? 'ring-2 ring-white/70' : '')}
            >
              <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="w-4 h-4" />Get Genius CRM</span>
              <span className="mt-1 block text-[11px] leading-snug text-white/85">Leads, quotes, contracts, invoices and payments, all with your booth.</span>
              <span className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-semibold text-[#784BD1] group-hover:bg-white">See Genius <span aria-hidden>→</span></span>
            </Link>
          )}
          {isFoundingMember && (
            <div className="flex items-center gap-1 pl-3 pt-2">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
              <span className="text-[10px] font-bold text-yellow-400 tracking-wide uppercase">Founding Member</span>
            </div>
          )}
          <p className="text-sidebar-text text-[10px] pl-3 pt-2 opacity-30">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
