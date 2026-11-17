export const dynamic = 'force-dynamic';
import { requireTenantSession, hasProAccess } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { galleriesWithPhotos, FREE_GALLERY_LIMIT } from '@/lib/gallery/planLimit';
import { galleryRules, getUploadLimits } from '@/lib/gallery/uploadRules';
import { TopBar } from '@/components/layout/TopBar';
import EventsTabs from '@/app/(tenant)/events/EventsTabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';


const GC: Record<string,any> = { PENDING_UPLOAD:'default', PENDING_REVIEW:'info', APPROVED:'success', CHANGES_REQUESTED:'warning' };
function approvalLabel(status: string, photoCount: number, isPublished: boolean) {
  if (isPublished && photoCount > 0) return { variant: 'success', label: 'APPROVED' };
  if (status === 'PENDING_UPLOAD' && photoCount > 0) return { variant: 'info', label: 'PENDING REVIEW' };
  return { variant: GC[status], label: status.replace(/_/g, ' ') };
}

export default async function GalleryPage() {
  const session = await requireTenantSession();
  const isPro = await hasProAccess(session.tenantId);

  // Without a paid plan, photos can go into one event gallery (src/lib/gallery/planLimit.ts)
  const usedGalleries = isPro ? 0 : await galleriesWithPhotos(session.tenantId);
  const uploadLimits = await getUploadLimits();

  // Auto-create galleries only for active (BOOKED/IN_PROGRESS) events
  const eventsWithoutGallery = await prisma.event.findMany({
    where: { tenantId: session.tenantId, gallery: null, status: { in: ['BOOKED', 'IN_PROGRESS'] } },
    select: { id: true, title: true },
  });
  if (eventsWithoutGallery.length > 0) {
    await prisma.gallery.createMany({
      data: eventsWithoutGallery.map(e => ({ tenantId: session.tenantId, eventId: e.id, title: e.title + ' Gallery' })),
    });
  }

  const galInclude = { event: { select: { title: true, eventDate: true } }, _count: { select: { assets: true } } } as const;

  const [activeGalleries, completedGalleries] = await Promise.all([
    prisma.gallery.findMany({
      where: { tenantId: session.tenantId, event: { status: { in: ['BOOKED', 'IN_PROGRESS', 'LEAD', 'QUOTED'] } } },
      include: galInclude,
      orderBy: { event: { eventDate: 'asc' } },
    }),
    prisma.gallery.findMany({
      where: { tenantId: session.tenantId, event: { status: 'COMPLETED' } },
      include: galInclude,
      orderBy: { event: { eventDate: 'desc' } },
      take: 10,
    }),
  ]);

  const GalleryTable = ({ rows }: { rows: typeof activeGalleries }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead><tr className="border-b bg-gray-50"><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Gallery</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Assets</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Approval</th><th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Published</th></tr></thead>
        <tbody>{rows.map(g => (<tr key={g.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"><td className="px-6 py-4"><Link href={'/gallery/' + g.id} className="block"><p className="font-medium text-sm">{g.title}</p><p className="text-xs text-gray-400">{g.event.title} &bull; {format(g.event.eventDate,'MMM d, yyyy')}</p></Link></td><td className="px-6 py-4 text-sm">{g._count.assets} photos</td><td className="px-6 py-4">{(() => { const a = approvalLabel(g.approvalStatus, g._count.assets, g.isPublished); return <Badge variant={a.variant}>{a.label}</Badge>; })()}</td><td className="px-6 py-4">{g.isExpired ? <Badge variant="danger">Expired</Badge> : <Badge variant={g.isPublished ? 'success' : 'default'}>{g.isPublished ? 'Published' : 'Draft'}</Badge>}</td></tr>))}</tbody>
      </table>
    </div>
  );

  return (
    <>
      <TopBar title="Gallery" />
      <div className="p-4 sm:p-8 space-y-8">
        <EventsTabs className="-mb-2" />
        {!isPro && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <p className="flex-1 text-sm text-orange-800">
              Your current plan includes photos for {FREE_GALLERY_LIMIT} event gallery ({Math.min(usedGalleries, FREE_GALLERY_LIMIT)} of {FREE_GALLERY_LIMIT} used). Subscribe to add photos to every event.
            </p>
            <Link href="/settings/billing" className="flex-shrink-0 inline-block px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg text-sm transition-colors">See plans</Link>
          </div>
        )}
        <details className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <summary className="cursor-pointer select-none font-medium text-[#1F1F3D]">Gallery upload rules</summary>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            {galleryRules(uploadLimits).map(r => <li key={r}>{r}</li>)}
            {!isPro && <li>Your current plan includes photos for {FREE_GALLERY_LIMIT} event gallery.</li>}
          </ul>
        </details>
        <Card><CardContent className="p-0">
          {activeGalleries.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Camera className="w-12 h-12 mx-auto mb-4 opacity-30"/><p>Gallery folders are created automatically when you book an event.</p></div>
          ) : (
            <GalleryTable rows={activeGalleries} />
          )}
        </CardContent></Card>

        {completedGalleries.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Completed Events <span className="font-normal normal-case">(last 10)</span></h2>
            <Card><CardContent className="p-0">
              <GalleryTable rows={completedGalleries} />
            </CardContent></Card>
          </div>
        )}
      </div>
    </>
  );
}
