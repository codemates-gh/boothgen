import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';

const GC: Record<string,any> = { PENDING_UPLOAD:'default', PENDING_REVIEW:'info', APPROVED:'success', CHANGES_REQUESTED:'warning' };

export default async function GalleryPage() {
  const session = await requireTenantSession();
  const galleries = await prisma.gallery.findMany({ where: { tenantId: session.tenantId }, include: { event: { select: { title: true, eventDate: true } }, _count: { select: { assets: true } } }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <TopBar title="Gallery" />
      <div className="p-8">
        <Card><CardContent className="p-0">
          {galleries.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Gallery folders are created automatically when you create an event.</p></div>
          ) : (
            <table className="w-full">
              <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Gallery</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Approval</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Published</th></tr></thead>
              <tbody>{galleries.map(g => (<tr key={g.id} className="border-b last:border-0"><td className="px-6 py-4"><p className="font-medium text-sm">{g.title}</p><p className="text-xs text-gray-400">{g.event.title} &bull; {format(g.event.eventDate,'MMM d, yyyy')}</p></td><td className="px-6 py-4 text-sm">{g._count.assets}</td><td className="px-6 py-4"><Badge variant={GC[g.approvalStatus]}>{g.approvalStatus.replace(/_/g,' ')}</Badge></td><td className="px-6 py-4"><Badge variant={g.isPublished ? 'success' : 'default'}>{g.isPublished ? 'Published' : 'Draft'}</Badge></td></tr>))}</tbody>
            </table>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
