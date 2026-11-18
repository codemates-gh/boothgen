export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { reportViewer } from '@/lib/reports/server';
import { RoadmapCreate, createRoadmapItem, listRoadmapItems } from '@/lib/roadmap/server';

// Super Admin → Reports → Roadmap: every item with its linked suggestion count
export async function GET() {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  return NextResponse.json({ items: await listRoadmapItems() });
}

export async function POST(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  const parsed = RoadmapCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid item' }, { status: 400 });
  const result = await createRoadmapItem(parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ item: result.item }, { status: 201 });
}
