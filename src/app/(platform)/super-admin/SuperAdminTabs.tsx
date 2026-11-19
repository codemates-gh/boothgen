'use client';
// Super Admin menu, grouped: a side menu on wide screens, a grouped dropdown on phones and tablets
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, Mail, FileText, Settings, BookOpen, BarChart2, Star, Layout, Bug, Smile, Image as ImageIcon, Activity, HardDrive, PersonStanding, Wand2 } from 'lucide-react';

const GROUPS = [
  { label: 'Platform', items: [
    { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'reports',   label: 'Reports',   icon: Bug },
  ] },
  { label: 'Operators', items: [
    { id: 'operators',   label: 'Operators',        icon: Users },
    { id: 'founding',    label: 'Founding Members', icon: Star },
    { id: 'genie-usage', label: 'Genie Usage',      icon: Activity },
    { id: 'storage',     label: 'Storage',          icon: HardDrive },
  ] },
  { label: 'Genie library', items: [
    { id: 'design-templates', label: 'Design Templates', icon: Layout },
    { id: 'props',            label: 'Props',            icon: Smile },
    { id: 'backdrops',        label: 'Backdrops',        icon: ImageIcon },
    { id: 'poses',            label: 'Poses',            icon: PersonStanding },
    { id: 'ai-themes',        label: 'AI themes',        icon: Wand2 },
  ] },
  { label: 'Payments & email', items: [
    { id: 'payment',         label: 'Payment Processing', icon: CreditCard },
    { id: 'email-logs',      label: 'Email Logs',         icon: Mail },
    { id: 'email-templates', label: 'Email Templates',    icon: FileText },
  ] },
  { label: 'Site', items: [
    { id: 'blog',     label: 'Blog',     icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] },
];

export default function SuperAdminTabs({ active, failedTotal, reportsUnread = 0 }: { active: string; failedTotal: number; reportsUnread?: number }) {
  const router = useRouter();
  const badgeFor = (id: string) => (id === 'email-logs' ? failedTotal : id === 'reports' ? reportsUnread : 0);

  return (
    <>
      {/* Phones and tablets: one grouped dropdown */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 sm:px-8 py-3">
        <label htmlFor="super-admin-section" className="sr-only">Section</label>
        <select
          id="super-admin-section"
          value={active}
          onChange={e => router.push('?tab=' + e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-[#1F1F3D] focus:outline-none focus:ring-2 focus:ring-[#0085FF]/30"
        >
          {GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map(t => {
                const b = badgeFor(t.id);
                return <option key={t.id} value={t.id}>{t.label}{b > 0 ? ` (${b})` : ''}</option>;
              })}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Wide screens: side menu with group headings */}
      <nav aria-label="Super Admin" className="hidden lg:block w-60 flex-shrink-0 self-start sticky top-0 max-h-screen overflow-y-auto pl-6 pr-2 py-8 space-y-5">
        {GROUPS.map(g => (
          <div key={g.label}>
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
            {g.items.map(t => {
              const isActive = active === t.id;
              const badge = badgeFor(t.id);
              return (
                <Link
                  key={t.id}
                  href={`?tab=${t.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors border ' + (isActive ? 'bg-white text-[#1F1F3D] font-semibold shadow-sm border-gray-200' : 'text-[#676879] hover:bg-gray-100 hover:text-[#1F1F3D] border-transparent')}
                >
                  <t.icon className={'w-4 h-4 flex-shrink-0 ' + (isActive ? 'text-brand' : '')} />
                  <span className="flex-1">{t.label}</span>
                  {badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-600 leading-none">{badge}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
