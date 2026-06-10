import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, FileText, Settings } from 'lucide-react';
import { format } from 'date-fns';

const CC: Record<string,any> = { DRAFT:'default', SENT_TO_CLIENT:'info', CLIENT_SIGNED:'warning', HOST_SIGNED:'warning', FULLY_EXECUTED:'success', VOIDED:'danger' };

export default async function ContractsPage() {
  const session = await requireTenantSession();
  const [contracts, templateCount] = await Promise.all([
    prisma.contract.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.contractTemplate.count({ where: { tenantId: session.tenantId } }),
  ]);
  return (
    <>
      <TopBar title="Contracts" />
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/contracts/new"><Button>New Contract</Button></Link>
            <Link href="/contracts/templates">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2"/>
                Templates {templateCount > 0 ? '(' + templateCount + ')' : '(0 — set up first)'}
              </Button>
            </Link>
          </div>
          {templateCount === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm text-yellow-800">
              ⚠️  No templates yet. <Link href="/contracts/templates" className="font-semibold underline">Create one</Link> before creating contracts.
            </div>
          )}
        </div>
        <Card><CardContent className="p-0">
          {contracts.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><FileText className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>No contracts yet.</p></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Title</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Client</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th><th className="px-6 py-3"></th></tr></thead>
              <tbody>
                {contracts.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-4"><p className="font-semibold text-sm">{c.title}</p>{c.event && <p className="text-xs text-gray-400">{c.event.title}</p>}</td>
                    <td className="px-6 py-4 text-sm">{c.client.firstName} {c.client.lastName}</td>
                    <td className="px-6 py-4"><Badge variant={CC[c.status]}>{c.status.replace(/_/g,' ')}</Badge></td>
                    <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 text-right"><Link href={'/contracts/' + c.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
