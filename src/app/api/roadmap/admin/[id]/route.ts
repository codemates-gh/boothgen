export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { reportViewer } from '@/lib/reports/server';
import { RoadmapUpdate, deleteRoadmapItem, linkedSuggestions, loadRoadmapItem, updateRoadmapItem } from '@/lib/roadmap/server';

type Ctx = { params: Promise<{ id: string }> };

async function admin() {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  return viewer;
}

// One item with the suggestions linked to it
export async function GET(_req: NextRequest, props: Ctx) {
  const viewer = await admin();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await props.params;
  const item = await loadRoadmapItem(id);
  if (!item) return NextResponse.json({ error: 'Roadmap item not found' }, { status: 404 });
  return NextResponse.json({ item, suggestions: await linkedSuggestions(id) });
}

// Edit, change status, show to operators, reorder ({ move: 'up' | 'down' } or { position })
export async function PATCH(req: NextRequest, props: Ctx) {
  const viewer = await admin();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await props.params;
  const parsed = RoadmapUpdate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const result = await updateRoadmapItem(id, parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ item: result.item });
}

// Linked suggestions go back to Confirmed
export async function DELETE(_req: NextRequest, props: Ctx) {
  const viewer = await admin();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await props.params;
  if (!(await deleteRoadmapItem(id, viewer.userId))) return NextResponse.json({ error: 'Roadmap item not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
