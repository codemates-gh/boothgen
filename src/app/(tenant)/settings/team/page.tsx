export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { format } from 'date-fns';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team']];
const RC: Record<string,any> = { HOST_ADMIN:'brand', TEAM_MEMBER:'default' };
const SC: Record<string,any> = { ACTIVE:'success', INVITED:'info', SUSPENDED:'danger' };

export default async function TeamSettingsPage() {
  const session = await requireTenantSession();
  const members = await prisma.tenantMembership.findMany({ where: { tenantId: session.tenantId }, include: { user: { select: { name: true, email: true } } }, orderBy: { joinedAt: 'desc' } });
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'team' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Team Members ({members.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Member</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Joined</th></tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-6 py-4"><p className="font-medium text-sm">{m.user.name}</p><p className="text-xs text-gray-400">{m.user.email}</p></td>
                    <td className="px-6 py-4"><Badge variant={RC[m.role]}>{m.role.replace('_',' ')}</Badge></td>
                    <td className="px-6 py-4"><Badge variant={SC[m.status]}>{m.status}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{m.joinedAt ? format(m.joinedAt,'MMM d, yyyy') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
