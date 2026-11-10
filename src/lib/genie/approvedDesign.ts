import { prisma } from '@/lib/prisma/client';
import { artworkFit, type ImageInfo } from './image';
import { verifyAsset, type RemoteAsset } from './templateAssets';
import type { StoredLayout } from './schemas';

// The client-approved design for the event (latest approved version)
export async function latestApprovedDesign(tenantId: string, eventId: string) {
  return prisma.templateDesign.findFirst({ where: { tenantId, eventId, status: 'APPROVED' }, orderBy: { version: 'desc' } });
}

export type DesignArtwork = { asset: RemoteAsset; info: ImageInfo };

// Reads the approved file from storage. Only PNG/JPG designs uploaded for this tenant qualify.
export async function loadDesignArtwork(tenantId: string, fileUrl: string): Promise<DesignArtwork | { error: string }> {
  const v = await verifyAsset(fileUrl, [`templates/${tenantId}/`]);
  if ('error' in v) return { error: v.error === 'Use a PNG or JPG image.' ? 'The approved design is not a PNG or JPG. Upload it as an image to use it in Genie.' : v.error };
  return v;
}

// Puts the artwork on the layout with the same shape: PNG with transparency goes over the photos, anything
// else behind them. The other artwork slot is cleared (the approved design is the whole look).
export function applyArtwork(layouts: { layout: StoredLayout; alternateLayout: StoredLayout | null }, art: DesignArtwork, mode?: 'background' | 'overlay') {
  const which = artworkFit(art.info, layouts.layout).ok ? 'layout' : layouts.alternateLayout && artworkFit(art.info, layouts.alternateLayout).ok ? 'alternateLayout' : null;
  if (!which) {
    const l = layouts.layout;
    return { error: `The approved design is ${art.info.width}×${art.info.height}, which doesn't match this template's ${l.widthPx}×${l.heightPx} layout${layouts.alternateLayout ? ' or its alternate' : ''}.` };
  }
  const as = mode ?? (art.info.contentType === 'image/png' && art.info.hasAlpha ? 'overlay' : 'background');
  if (as === 'overlay' && !art.info.hasAlpha) return { error: 'The approved design has no transparent areas, so it can only go behind the photos.' };
  const target = layouts[which]!;
  const { background: _b, overlay: _o, ...rest } = target;
  const updated: StoredLayout = { ...rest, [as]: art.asset } as StoredLayout;
  const fit = artworkFit(art.info, target);
  return { which, as, updated, warning: fit.ok ? fit.warning : undefined };
}

