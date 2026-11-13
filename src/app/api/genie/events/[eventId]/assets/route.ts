export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import type { Gallery, GalleryAsset, GenieSession } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { headR2Object, r2PublicUrl } from '@/lib/storage/r2';
import { authenticateDevice, findDeviceEvent, genieError, isUniqueViolation, readJson } from '@/lib/genie/auth';
import { ensureGallery, sessionUrl } from '@/lib/genie/bundle';
import { dispatchReadyShares, ensureGenieSession } from '@/lib/genie/sessions';
import { GalleryUpload, firstIssue } from '@/lib/genie/schemas';

function registered(asset: GalleryAsset, gallery: Gallery, session: Pick<GenieSession, 'publicToken'>, status: 200 | 201) {
  return NextResponse.json({ assetId: asset.id, url: asset.url, sessionUrl: sessionUrl(gallery, session.publicToken) }, { status });
}

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = GalleryUpload.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const body = parsed.data;

  const gallery = await ensureGallery(event);
  const repeat = async () => {
    const asset = await prisma.galleryAsset.findUnique({
      where: { galleryId_clientId: { galleryId: gallery.id, clientId: body.clientId } },
      include: { genieSession: { select: { publicToken: true } } },
    });
    return asset ? registered(asset, gallery, asset.genieSession ?? body.session, 200) : null;
  };
  const existing = await repeat();
  if (existing) return existing;

  if (!body.storageKey.startsWith('galleries/' + auth.tenant.id + '/' + gallery.id + '/')) {
    return genieError(422, 'invalid_storage_key', 'storageKey was not issued for this event');
  }
  const object = await headR2Object(body.storageKey);
  if (!object) return genieError(422, 'object_missing', 'The file was not found in storage');
  if (object.bytes !== body.bytes) return genieError(422, 'size_mismatch', `Stored object is ${object.bytes} bytes, expected ${body.bytes}`);

  const session = await ensureGenieSession(event, gallery, auth.device.id, body.session);
  if (!session) return genieError(422, 'session_conflict', 'This session id or token belongs to another event');

  // A boomerang's poster is its thumbnail (gallery grid, link previews); either may arrive first
  const poster = body.kind === 'boomerang'
    ? await prisma.galleryAsset.findFirst({ where: { genieSessionId: session.id, genieKind: 'boomerangPoster' }, select: { url: true } })
    : null;

  let asset: GalleryAsset;
  try {
    asset = await prisma.galleryAsset.create({
      data: {
        galleryId: gallery.id,
        clientId: body.clientId,
        genieSessionId: session.id,
        assetType: body.kind === 'boomerang' ? 'VIDEO' : 'PHOTO',
        url: r2PublicUrl(body.storageKey),
        ...(poster ? { thumbnailUrl: poster.url } : {}),
        ...(body.durationMs ? { durationMs: body.durationMs } : {}),
        filename: body.fileName,
        fileSizeBytes: body.bytes,
        mimeType: body.contentType,
        width: body.width,
        height: body.height,
        genieKind: body.kind,
        // Boomerang clip / gallery copy first, then shots in order; the printer sheet (archive only) and the
        // boomerang poster (thumbnail only) last
        sortOrder: body.kind === 'gallery' || body.kind === 'boomerang' ? 0 : body.kind === 'shot' ? (body.shotIndex ?? 0) + 1 : body.kind === 'print' ? 1000 : 1001,
        approvalStatus: 'APPROVED',
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await repeat();
    if (raced) return raced;
    throw err;
  }

  if (body.kind === 'boomerangPoster') {
    await prisma.galleryAsset.updateMany({ where: { genieSessionId: session.id, genieKind: 'boomerang' }, data: { thumbnailUrl: asset.url } });
  }

  // Same as manual uploads: advance approval status off PENDING_UPLOAD once photos arrive
  if (gallery.approvalStatus === 'PENDING_UPLOAD') {
    await prisma.gallery.updateMany({ where: { id: gallery.id, approvalStatus: 'PENDING_UPLOAD' }, data: { approvalStatus: 'PENDING_REVIEW' } });
  }
  await dispatchReadyShares(session.id);
  return registered(asset, gallery, session, 201);
}
