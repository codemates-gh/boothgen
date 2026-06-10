'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Calendar, Users, FileText, Receipt, Zap, Settings, Camera, LogOut, ChevronRight, Mail } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/contracts', label: 'Contracts', icon: FileText },
  { href: '/gallery', label: 'Gallery', icon: Camera },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/automation/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const companyName = session?.tenant?.name ?? 'Loading...';

  return (
    <aside className="w-64 h-screen bg-canvas flex flex-col fixed left-0 top-0 z-40">
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <Camera className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Photo Booth CRM</p>
            <p className="text-sidebar-text text-xs truncate max-w-[140px]">{companyName}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + '/');
          return (
            <Link key={href} href={href} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors group', active ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white')}>
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
        <button onClick={() => signOut({ callbackUrl: '/sign-in' })} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white w-full transition-colors">
          <LogOut className="w-4 h-4" />Sign Out
        </button>
      </div>
    </aside>
  );
}
