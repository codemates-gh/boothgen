export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { InviteForm } from './InviteForm';
import { TeamAccessForm } from './TeamAccessForm';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture']];
const RC: Record<string,any> = { HOST_ADMIN:'brand', TEAM_MEMBER:'default' };
const SC: Record<string,any> = { ACTIVE:'success', INVITED:'info', SUSPENDED:'danger' };

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
        <div className="flex flex-wrap gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-3 sm:px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'team' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
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
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Team Members ({tenant?.memberships.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
                <tbody>
                  {tenant?.memberships.map(m => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="px-6 py-4"><p className="font-medium text-sm">{m.user.name}</p><p className="text-xs text-gray-400">{m.user.email}</p></td>
                      <td className="px-6 py-4"><Badge variant={RC[m.role]}>{m.role.replace('_',' ')}</Badge></td>
                      <td className="px-6 py-4"><Badge variant={SC[m.status]}>{m.status}</Badge></td>
                      <td className="px-6 py-4 text-sm text-gray-500">{m.joinedAt ? format(m.joinedAt,'MMM d, yyyy') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
