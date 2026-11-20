export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice, findDeviceEvent, genieError } from '@/lib/genie/auth';
import { ensureGallery } from '@/lib/genie/bundle';
import { deleteGenieSession } from '@/lib/genie/sessionDelete';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The guest cancelled on the review screen: the session's files leave the gallery (Genie SessionDeleted)
export async function DELETE(req: NextRequest, props: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');
  if (!UUID.test(params.sessionId)) return genieError(400, 'invalid_request', 'sessionId must be a UUID');
  const gallery = await ensureGallery(event);
  const r = await deleteGenieSession(event, gallery, auth.device.id, params.sessionId);
  if (!r.ok) return genieError(422, 'session_conflict', 'This session id belongs to another event');
  return NextResponse.json({ sessionId: params.sessionId, assetsDeleted: r.assetsDeleted, sharesCancelled: r.sharesCancelled });
}
