export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { devAuthorized } from '@/lib/reports/devApi';
import { RoadmapUpdate, linkedSuggestions, loadRoadmapItem, updateRoadmapItem } from '@/lib/roadmap/server';

type Ctx = { params: Promise<{ id: string }> };

// One item with its linked suggestions (numbers, titles, votes)
export async function GET(req: NextRequest, props: Ctx) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const { id } = await props.params;
  const item = await loadRoadmapItem(id);
  if (!item) return NextResponse.json({ error: 'Roadmap item not found' }, { status: 404 });
  return NextResponse.json({ item, suggestions: await linkedSuggestions(id) });
}

// Update like Super Admin: fields, status, group, position ({ position: { top | bottom | before | after } })
export async function POST(req: NextRequest, props: Ctx) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const { id } = await props.params;
  const parsed = RoadmapUpdate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const result = await updateRoadmapItem(id, parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ item: result.item });
}
