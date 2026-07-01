export const dynamic = 'force-dynamic';
import { requireTenantSession, hasProAccess } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Lock } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

const GC: Record<string,any> = { PENDING_UPLOAD:'default', PENDING_REVIEW:'info', APPROVED:'success', CHANGES_REQUESTED:'warning' };
function approvalLabel(status: string, photoCount: number) {
  if (status === 'PENDING_UPLOAD' && photoCount > 0) return { variant: 'info', label: 'PENDING REVIEW' };
  return { variant: GC[status], label: status.replace(/_/g, ' ') };
}

export default async function GalleryPage() {
  const session = await requireTenantSession();
  const isPro = await hasProAccess(session.tenantId);

  if (!isPro) {
    return (
      <>
        <TopBar title="Gallery" />
        <div className="p-8 max-w-xl mx-auto text-center mt-12">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Gallery is a Pro feature</h2>
          <p className="text-gray-500 mb-6 leading-relaxed">
            Upload event photos, share a private gallery with your client, and let guests download photos — all included in the Pro plan.
          </p>
          <Link
            href="/settings/billing"
            className="inline-block px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-sm transition-colors"
          >
            Upgrade to Pro →
          </Link>
          <p className="mt-4 text-xs text-gray-400">Your current plan is commission-based. Upgrade anytime — no long-term contract.</p>
        </div>
      </>
    );
  }

  // Auto-create missing gallery records for any events that don't have one
  const eventsWithoutGallery = await prisma.event.findMany({
    where: { tenantId: session.tenantId, gallery: null },
    select: { id: true, title: true },
  });
  if (eventsWithoutGallery.length > 0) {
    await prisma.gallery.createMany({
      data: eventsWithoutGallery.map(e => ({ tenantId: session.tenantId, eventId: e.id, title: e.title + ' Gallery' })),
    });
  }

  const galleries = await prisma.gallery.findMany({
    where: { tenantId: session.tenantId },
    include: { event: { select: { title: true, eventDate: true } }, _count: { select: { assets: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <TopBar title="Gallery" />
      <div className="p-4 sm:p-8">
        <Card><CardContent className="p-0">
          {galleries.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Gallery folders are created automatically when you create an event.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Gallery</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Approval</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Published</th></tr></thead>
                <tbody>{galleries.map(g => (<tr key={g.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"><td className="px-6 py-4"><Link href={'/gallery/' + g.id} className="block"><p className="font-medium text-sm">{g.title}</p><p className="text-xs text-gray-400">{g.event.title} &bull; {format(g.event.eventDate,'MMM d, yyyy')}</p></Link></td><td className="px-6 py-4 text-sm">{g._count.assets} photos</td><td className="px-6 py-4">{(() => { const a = approvalLabel(g.approvalStatus, g._count.assets); return <Badge variant={a.variant}>{a.label}</Badge>; })()}</td><td className="px-6 py-4">{g.isExpired ? <Badge variant="danger">Expired</Badge> : <Badge variant={g.isPublished ? 'success' : 'default'}>{g.isPublished ? 'Published' : 'Draft'}</Badge>}</td></tr>))}</tbody>
              </table>
            </div>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}
