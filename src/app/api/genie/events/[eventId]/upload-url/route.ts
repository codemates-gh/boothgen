export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { canAddGalleryPhotos, GALLERY_LIMIT_MESSAGE } from '@/lib/gallery/planLimit';
import { galleryUploadBlock, getUploadLimits, fileSizeBlock } from '@/lib/gallery/uploadRules';
import { getPresignedUploadUrl } from '@/lib/storage/r2';
import { authenticateDevice, findDeviceEvent, genieError, readJson } from '@/lib/genie/auth';
import { ensureGallery } from '@/lib/genie/bundle';
import { UploadUrlRequest, firstIssue } from '@/lib/genie/schemas';

const EXPIRES_IN_SECONDS = 3600;

export async function POST(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = UploadUrlRequest.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const { clientId, fileName, contentType, bytes } = parsed.data;

  const gallery = await ensureGallery(event);
  if (!(await canAddGalleryPhotos(auth.tenant.id, gallery.id))) return genieError(403, 'pro_required', GALLERY_LIMIT_MESSAGE);
  // Size per type (photos / boomerang MP4s) and the per-event cap from Super Admin → Settings; no date window for the booth
  const limits = await getUploadLimits();
  const tooBig = fileSizeBlock(fileName, contentType, bytes, limits);
  if (tooBig) return genieError(400, 'invalid_request', tooBig);
  const blocked = await galleryUploadBlock(gallery.id, null, bytes, limits);
  if (blocked) return genieError(403, 'gallery_limit', blocked);
  // Same prefix as gallery uploads; keyed on clientId so a retried request gets the same key
  const storageKey = 'galleries/' + auth.tenant.id + '/' + gallery.id + '/genie-' + clientId + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // The size is part of the signature: R2 refuses a PUT of any other length
  const uploadUrl = await getPresignedUploadUrl(storageKey, contentType, bytes);
  return NextResponse.json({
    uploadUrl,
    storageKey,
    expiresAt: new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString(),
  });
}
