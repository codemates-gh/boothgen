export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { devAuthorized } from '@/lib/reports/devApi';
import { ROADMAP_STATUS_VALUES } from '@/lib/roadmap/options';
import { RoadmapCreate, createRoadmapItem, listRoadmapItems } from '@/lib/roadmap/server';

// Roadmap for the orchestrator (scripts/dev-roadmap.mjs), same REPORTS_DEV_TOKEN as the Dev reports API.
// Separate from /api/dev/reports: the scheduled Dev job never sees roadmap items.
export async function GET(req: NextRequest) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const status = req.nextUrl.searchParams.get('status');
  if (status && !(ROADMAP_STATUS_VALUES as readonly string[]).includes(status)) return NextResponse.json({ error: `Status is one of ${ROADMAP_STATUS_VALUES.join(', ')}` }, { status: 400 });
  return NextResponse.json({ items: await listRoadmapItems(status ? { status } : {}) });
}

export async function POST(req: NextRequest) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const parsed = RoadmapCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid item' }, { status: 400 });
  const result = await createRoadmapItem(parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ item: result.item }, { status: 201 });
}
