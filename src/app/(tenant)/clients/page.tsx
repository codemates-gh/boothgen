export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Mail, Phone, ArrowRight, Building2 } from 'lucide-react';
import { format } from 'date-fns';

export default async function ClientsPage() {
  const session = await requireTenantSession();
  const clients = await prisma.client.findMany({ where: { tenantId: session.tenantId }, include: { _count: { select: { events: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return (
    <>
      <TopBar title="Clients" />
      <div className="p-4 sm:p-8">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-gray-500">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
          <Link href="/events/new"><Button>Add Client + Event</Button></Link>
        </div>
        <Card><CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Users className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Clients appear here when you create events or receive inquiries.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Events</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Added</th><th className="px-6 py-3"></th></tr></thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-6 py-4"><div className="flex items-center gap-2 flex-wrap"><p className="font-semibold">{c.firstName} {c.lastName}</p>{c.isCorporate && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700"><Building2 className="w-2.5 h-2.5"/>Corporate</span>}</div>{c.company && <p className="text-xs text-gray-400">{c.company}</p>}</td>
                      <td className="px-6 py-4 text-sm"><div className="flex items-center gap-1 text-gray-600"><Mail className="w-3 h-3"/>{c.email}</div>{c.phone && <div className="flex items-center gap-1 text-gray-500 mt-1"><Phone className="w-3 h-3"/>{c.phone}</div>}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{c._count.events} event{c._count.events !== 1 ? 's' : ''}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{format(c.createdAt,'MMM d, yyyy')}</td>
                      <td className="px-6 py-4 text-right"><Link href={'/clients/' + c.id}><Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4"/></Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
