export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice, findDeviceEvent, genieError } from '@/lib/genie/auth';
import { eventAllowance, renderStatus, settleStale } from '@/lib/genie/ai/renders';

// Geniefied (Genie P13): a render's state, polled by the iPad (every 2 s) until done, blocked or failed
export async function GET(req: NextRequest, props: { params: Promise<{ eventId: string; renderId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  const event = await findDeviceEvent(auth, params.eventId);
  if (!event) return genieError(404, 'not_found', 'Event not found');
  const found = await prisma.genieAiRender.findFirst({ where: { id: params.renderId, eventId: event.id, tenantId: auth.tenant.id } });
  if (!found) return genieError(404, 'not_found', 'Render not found');
  const r = await settleStale(found);
  return NextResponse.json(await renderStatus(r, (await eventAllowance(event.id, auth.tenant.id)).left));
}
