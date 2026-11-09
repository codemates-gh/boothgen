export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Shield } from 'lucide-react';
import { InviteForm } from './InviteForm';
import { TeamAccessForm } from './TeamAccessForm';
import { TeamMembersTable } from './TeamMembersTable';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['booth-templates','Booth Templates'],['profile','Profile'],['import','Import'],['print-costs','Print Costs']];

export const ALL_TEAM_MODULES = [
  { id: 'events',   label: 'Events',           desc: 'View and manage assigned events' },
  { id: 'calendar', label: 'Calendar',          desc: 'View the event calendar' },
  { id: 'leads',    label: 'Leads & Messages',  desc: 'View and respond to incoming leads' },
  { id: 'quotes',   label: 'Quotes',            desc: 'View quotes (read-only)' },
  { id: 'invoices', label: 'Invoices',          desc: 'View invoices (read-only)' },
  { id: 'clients',  label: 'Clients',           desc: 'View client records' },
  { id: 'gallery',  label: 'Gallery',           desc: 'Access photo galleries (Pro only)' },
];

export default async function TeamSettingsPage() {
  const session = await requireTenantSession();
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      teamMemberAccess: true,
      memberships: { include: { user: { select: { name: true, email: true } } }, orderBy: { joinedAt: 'desc' } },
    },
  });

  const currentAccess: string[] = JSON.parse(tenant?.teamMemberAccess ?? '["events"]');

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'team' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</Link>)}
        </div>

        <InviteForm />

        {/* Team Member Access Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5"/>Team Member Access</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Control which sections team members can see when they log in. This applies to all team members on your account.</p>
          </CardHeader>
          <CardContent>
            <TeamAccessForm modules={ALL_TEAM_MODULES} currentAccess={currentAccess} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Team Members ({tenant?.memberships.length ?? 0})</CardTitle>
            <p className="text-xs text-gray-400 mt-1">Use the shield icon to change a member&apos;s role. Use the trash icon to remove them.</p>
          </CardHeader>
          <CardContent className="p-0">
            <TeamMembersTable
              members={(tenant?.memberships ?? []).map(m => ({
                ...m,
                joinedAt: m.joinedAt ? m.joinedAt.toISOString() : null,
              }))}
              currentUserId={session.userId}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
