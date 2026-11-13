import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma/client';

// Link previews (texts, chats): the boomerang's poster, else the gallery image
export async function generateMetadata({ params }: { params: { token: string; sessionToken: string } }): Promise<Metadata> {
  const session = await prisma.genieSession.findUnique({
    where: { publicToken: params.sessionToken },
    select: {
      gallery: { select: { clientToken: true, isExpired: true, event: { select: { title: true } } } },
      assets: { where: { approvalStatus: 'APPROVED', genieKind: { in: ['boomerangPoster', 'gallery'] } }, select: { url: true, genieKind: true, width: true, height: true } },
    },
  }).catch(() => null);
  if (!session || session.gallery.clientToken !== params.token) return {};
  const title = session.gallery.event.title ? `Your photos from ${session.gallery.event.title}` : 'Your photos';
  const image = session.gallery.isExpired ? undefined
    : session.assets.find(a => a.genieKind === 'boomerangPoster') ?? session.assets.find(a => a.genieKind === 'gallery');
  return {
    title,
    openGraph: { title, ...(image ? { images: [{ url: image.url, ...(image.width ? { width: image.width } : {}), ...(image.height ? { height: image.height } : {}) }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, ...(image ? { images: [image.url] } : {}) },
  };
}

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
