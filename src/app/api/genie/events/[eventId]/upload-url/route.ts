export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl } from '@/lib/storage/r2';
import { hasProAccess } from '@/lib/auth/session';
import { authenticateDevice, findDeviceEvent, genieError, readJson } from '@/lib/genie/auth';
import { ensureGallery } from '@/lib/genie/bundle';
import { UploadUrlRequest, firstIssue } from '@/lib/genie/schemas';

const EXPIRES_IN_SECONDS = 3600;

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  if (!await hasProAccess(auth.tenant.id)) return genieError(403, 'pro_required', 'Pro subscription required for galleries');

  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');

  const parsed = UploadUrlRequest.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', firstIssue(parsed.error));
  const { clientId, fileName, contentType, bytes } = parsed.data;

  const gallery = await ensureGallery(event);
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
