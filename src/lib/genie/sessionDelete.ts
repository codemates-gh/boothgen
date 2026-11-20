import type { Event, Gallery, GalleryAsset } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyForPublicUrl } from '@/lib/storage/r2';

// Deletes (Genie: the iPad uploads from the review screen, so a guest who cancels, or changes a photo, leaves files that
// have to come out of the gallery). Both arrive through the iPad's outbox: late, and possibly more than once.

async function removeObject(url: string | null | undefined) {
  const key = url ? r2KeyForPublicUrl(url) : null;
  if (!key) return;
  await deleteFromR2(key).catch(err => console.error('[genie-delete] storage delete failed', key, err));
}

// A render's input may be the very object a shot asset points at; once that object is gone, the sweep has nothing to do
async function forgetRenderInputs(keys: string[]) {
  if (keys.length) await prisma.genieAiRender.updateMany({ where: { inputKey: { in: keys } }, data: { inputKey: '' } });
}

async function removeAssets(assets: Pick<GalleryAsset, 'id' | 'url'>[]) {
  for (const a of assets) await removeObject(a.url);
  await forgetRenderInputs(assets.map(a => r2KeyForPublicUrl(a.url)).filter((k): k is string => !!k));
  if (assets.length) await prisma.galleryAsset.deleteMany({ where: { id: { in: assets.map(a => a.id) } } });
}

export type SessionDeleteResult = { ok: true; assetsDeleted: number; sharesCancelled: number } | { ok: false };

// The guest cancelled on review: every file of the session, its Geniefied images and its unsent texts/emails go.
// The session row stays as a tombstone (deletedAt). An unknown session gets a tombstone too, so an upload still in the
// iPad's outbox is refused (410) instead of starting the session again. ok: false = the session is another event's.
export async function deleteGenieSession(event: Pick<Event, 'id' | 'tenantId'>, gallery: Pick<Gallery, 'id'>, deviceId: string, clientId: string): Promise<SessionDeleteResult> {
  let session = await prisma.genieSession.findUnique({ where: { clientId } });
  if (session && (session.eventId !== event.id || session.tenantId !== event.tenantId)) return { ok: false };
  if (!session) {
    try {
      session = await prisma.genieSession.create({
        data: { tenantId: event.tenantId, eventId: event.id, galleryId: gallery.id, deviceId, clientId, publicToken: 'deleted:' + clientId, startedAt: new Date(), deletedAt: new Date() },
      });
      return { ok: true, assetsDeleted: 0, sharesCancelled: 0 };
    } catch (err) {
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      session = await prisma.genieSession.findUnique({ where: { clientId } });
      if (!session || session.eventId !== event.id || session.tenantId !== event.tenantId) return { ok: false };
    }
  }
  if (!session.deletedAt) await prisma.genieSession.update({ where: { id: session.id }, data: { deletedAt: new Date() } });

  // Repeats find nothing left, so they answer zeros
  const assets = await prisma.galleryAsset.findMany({ where: { genieSessionId: session.id }, select: { id: true, url: true } });
  await removeAssets(assets);

  // Geniefied images (the result, and the shot copy sent for rendering); the allowance stays used
  const renders = await prisma.genieAiRender.findMany({
    where: { eventId: event.id, sessionClientId: clientId, OR: [{ resultKey: { not: null } }, { inputKey: { not: '' } }] },
    select: { id: true, resultKey: true, inputKey: true },
  });
  for (const r of renders) {
    for (const key of [r.resultKey, r.inputKey]) if (key) await deleteFromR2(key).catch(err => console.error('[genie-delete] render delete failed', key, err));
  }
  if (renders.length) await prisma.genieAiRender.updateMany({ where: { id: { in: renders.map(r => r.id) } }, data: { resultKey: null, inputKey: '' } });

  const { count: sharesCancelled } = await prisma.genieShare.updateMany({ where: { sessionId: session.id, status: 'queued' }, data: { status: 'cancelled' } });
  console.log(`[genie-delete] session ${clientId} (event ${event.id}): ${assets.length} files, ${renders.length} renders, ${sharesCancelled} shares cancelled`);
  return { ok: true, assetsDeleted: assets.length, sharesCancelled };
}

// One file the iPad replaced on review (a retake, a new filter, a before/after that no longer applies). Only a Genie
// session's file of this gallery, never a manually uploaded photo. Returns whether something was deleted.
export async function deleteSessionAsset(gallery: Pick<Gallery, 'id'>, clientId: string): Promise<boolean> {
  const asset = await prisma.galleryAsset.findUnique({ where: { galleryId_clientId: { galleryId: gallery.id, clientId } } });
  if (!asset?.genieSessionId) return false;
  const sessionId = asset.genieSessionId;
  await removeAssets([asset]);

  // The session never loses its cover: the newest earlier copy comes back
  if (asset.genieKind === 'gallery' && !(await prisma.galleryAsset.count({ where: { genieSessionId: sessionId, genieKind: 'gallery' } }))) {
    const previous = await prisma.galleryAsset.findFirst({ where: { genieSessionId: sessionId, genieKind: 'gallerySuperseded' }, orderBy: { createdAt: 'desc' } });
    if (previous) await prisma.galleryAsset.update({ where: { id: previous.id }, data: { genieKind: 'gallery' } });
  }
  // A clip's poster is its thumbnail: use the newer poster if there is one, else none
  if (asset.genieKind === 'boomerangPoster' || asset.genieKind === 'videoPoster') {
    const replacement = await prisma.galleryAsset.findFirst({ where: { genieSessionId: sessionId, genieKind: asset.genieKind }, orderBy: { createdAt: 'desc' }, select: { url: true } });
    await prisma.galleryAsset.updateMany({
      where: { genieSessionId: sessionId, genieKind: asset.genieKind === 'boomerangPoster' ? 'boomerang' : 'video', thumbnailUrl: asset.url },
      data: { thumbnailUrl: replacement?.url ?? null },
    });
  }
  console.log(`[genie-delete] asset ${clientId} (${asset.genieKind}) of session ${sessionId}`);
  return true;
}
