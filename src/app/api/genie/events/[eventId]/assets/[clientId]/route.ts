export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice, findDeviceEvent, genieError } from '@/lib/genie/auth';
import { ensureGallery } from '@/lib/genie/bundle';
import { deleteSessionAsset } from '@/lib/genie/sessionDelete';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A file the iPad replaced on review (Genie AssetDeleted)
export async function DELETE(req: NextRequest, props: { params: Promise<{ eventId: string; clientId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');
  if (!UUID.test(params.clientId)) return genieError(400, 'invalid_request', 'clientId must be a UUID');
  const gallery = await ensureGallery(event);
  return NextResponse.json({ clientId: params.clientId, deleted: await deleteSessionAsset(gallery, params.clientId) });
}
