// Product roadmap items: their own records, never bug reports or suggestions, so the scheduled Dev job (which only
// reads reports assigned to Dev) can't pick them up. Shared by Super Admin (src/app/api/roadmap/admin) and the Dev
// roadmap API (src/app/api/dev/roadmap, scripts/dev-roadmap.mjs). Suggestions link to an item with the report
// status "On the roadmap" (src/lib/reports/triage.ts).
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { ROADMAP_AREA_VALUES, ROADMAP_GROUP_VALUES, ROADMAP_STATUS_VALUES } from './options';

const Day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD');
const Id = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,59}$/, 'Ids are lowercase letters, numbers and dashes');

const Fields = {
  title: z.string().trim().min(1, 'Add a title').max(120),
  summary: z.string().trim().min(1, 'Add a one-line description').max(200).refine(s => !s.includes('\n'), 'Keep the description to one line'),
  status: z.enum(ROADMAP_STATUS_VALUES),
  area: z.enum(ROADMAP_AREA_VALUES),
  group: z.enum(ROADMAP_GROUP_VALUES),
  targetDate: Day.nullable(),
  planRef: z.string().trim().max(120).nullable(),
  shippedAt: Day.nullable(),
  shippedVersion: z.string().trim().max(40).nullable(),
  visibleToOperators: z.boolean(),
};

// Where to put an item within its group: first, last, or next to another item of the same group
const Position = z.object({
  top: z.literal(true).optional(),
  bottom: z.literal(true).optional(),
  before: Id.optional(),
  after: Id.optional(),
}).strict();
export type RoadmapPosition = z.infer<typeof Position>;

export const RoadmapCreate = z.object({
  id: Id.optional(),
  title: Fields.title, summary: Fields.summary, area: Fields.area,
  status: Fields.status.default('planned'),
  group: Fields.group.default('later'),
  targetDate: Fields.targetDate.optional(), planRef: Fields.planRef.optional(),
  shippedAt: Fields.shippedAt.optional(), shippedVersion: Fields.shippedVersion.optional(),
  visibleToOperators: Fields.visibleToOperators.optional(),
  position: Position.optional(),
}).strict();

export const RoadmapUpdate = z.object({
  title: Fields.title.optional(), summary: Fields.summary.optional(), area: Fields.area.optional(),
  status: Fields.status.optional(), group: Fields.group.optional(),
  targetDate: Fields.targetDate.optional(), planRef: Fields.planRef.optional(),
  shippedAt: Fields.shippedAt.optional(), shippedVersion: Fields.shippedVersion.optional(),
  visibleToOperators: Fields.visibleToOperators.optional(),
  position: Position.optional(),
  // One step up or down within the group (Super Admin arrows)
  move: z.enum(['up', 'down']).optional(),
}).strict();

const asDate = (d: string | null | undefined) => (d === undefined ? undefined : d === null ? null : new Date(d + 'T00:00:00Z'));
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

function slugify(title: string) {
  return title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'item';
}

async function freeId(base: string) {
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.roadmapItem.findUnique({ where: { id }, select: { id: true } }))) return id;
  }
}

// Order only counts items that aren't shipped (shipped ones are listed by date)
const openInGroup = (group: string) => ({ group, status: { not: 'shipped' } });

// Rewrites a group's order as 0, 1, 2… with `id` placed where asked (default: last). Shipped items keep no place.
async function place(id: string, group: string, pos: RoadmapPosition | undefined): Promise<string | null> {
  const self = await prisma.roadmapItem.findUnique({ where: { id }, select: { status: true } });
  if (self?.status === 'shipped') return pos?.top || pos?.before || pos?.after ? 'Shipped items have no place in the order' : null;
  const others = (await prisma.roadmapItem.findMany({ where: { ...openInGroup(group), id: { not: id } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } })).map(r => r.id);
  let at = others.length;
  if (pos?.top) at = 0;
  else if (pos?.before || pos?.after) {
    const ref = (pos.before ?? pos.after)!;
    const i = others.indexOf(ref);
    if (i < 0) return `"${ref}" isn't in the same group`;
    at = pos.before ? i : i + 1;
  }
  others.splice(at, 0, id);
  await prisma.$transaction(others.map((rid, i) => prisma.roadmapItem.update({ where: { id: rid }, data: { sortOrder: i }, select: { id: true } })));
  return null;
}

export async function createRoadmapItem(d: z.infer<typeof RoadmapCreate>) {
  if (d.id && (await prisma.roadmapItem.findUnique({ where: { id: d.id }, select: { id: true } }))) return { error: `An item with the id "${d.id}" already exists` };
  const id = d.id ?? (await freeId(slugify(d.title)));
  const shipped = d.status === 'shipped';
  await prisma.roadmapItem.create({ data: {
    id, title: d.title, summary: d.summary, area: d.area, status: d.status, group: d.group, sortOrder: 1_000_000,
    targetDate: asDate(d.targetDate) ?? null, planRef: d.planRef || null,
    shippedAt: asDate(d.shippedAt) ?? (shipped ? today() : null), shippedVersion: d.shippedVersion || null,
    visibleToOperators: d.visibleToOperators ?? false,
  } });
  const err = await place(id, d.group, d.position);
  if (err) { await prisma.roadmapItem.delete({ where: { id } }); return { error: err }; }
  return { item: (await loadRoadmapItem(id))! };
}

export async function updateRoadmapItem(id: string, d: z.infer<typeof RoadmapUpdate>) {
  const cur = await prisma.roadmapItem.findUnique({ where: { id } });
  if (!cur) return { error: 'Roadmap item not found', status: 404 };
  const { position, move, ...f } = d;
  const status = f.status ?? cur.status;
  // Moving to Shipped stamps today's date unless a date is given or already set
  const shippedAt = f.shippedAt !== undefined ? asDate(f.shippedAt) : (status === 'shipped' && cur.status !== 'shipped' && !cur.shippedAt ? today() : undefined);
  await prisma.roadmapItem.update({ where: { id }, data: {
    ...f,
    ...(f.planRef !== undefined ? { planRef: f.planRef || null } : {}),
    ...(f.shippedVersion !== undefined ? { shippedVersion: f.shippedVersion || null } : {}),
    targetDate: asDate(f.targetDate), shippedAt,
  } });
  const group = f.group ?? cur.group;
  if (move) {
    const ids = (await prisma.roadmapItem.findMany({ where: openInGroup(group), orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } })).map(r => r.id);
    const i = ids.indexOf(id);
    const j = move === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await prisma.$transaction(ids.map((rid, n) => prisma.roadmapItem.update({ where: { id: rid }, data: { sortOrder: n }, select: { id: true } })));
    }
  } else if (position || group !== cur.group || (cur.status === 'shipped' && status !== 'shipped')) {
    // Back from Shipped (or into another group): to the end of the group unless a position is given
    const err = await place(id, group, position);
    if (err) return { error: err, status: 400 };
  }
  return { item: (await loadRoadmapItem(id))! };
}

// Deleting an item puts its linked suggestions back to Confirmed (quietly: an internal note, no email)
export async function deleteRoadmapItem(id: string, actorId: string | null) {
  const cur = await prisma.roadmapItem.findUnique({ where: { id }, select: { id: true, title: true, suggestions: { select: { id: true } } } });
  if (!cur) return false;
  await prisma.$transaction([
    ...cur.suggestions.map(s => prisma.feedbackNote.create({ data: { reportId: s.id, authorId: actorId, fromAdmin: true, internal: true, body: `Roadmap item "${cur.title}" was removed; back to Confirmed` } })),
    prisma.feedbackReport.updateMany({ where: { roadmapItemId: id }, data: { status: 'confirmed', roadmapItemId: null } }),
    prisma.roadmapItem.delete({ where: { id } }),
  ]);
  return true;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type ItemRow = Awaited<ReturnType<typeof prisma.roadmapItem.findUniqueOrThrow>> & { _count: { suggestions: number } };
function view(r: ItemRow) {
  const { _count, ...rest } = r;
  return { ...rest, targetDate: day(r.targetDate), shippedAt: day(r.shippedAt), suggestionCount: _count.suggestions };
}
export type RoadmapItemView = ReturnType<typeof view>;

const GROUP_ORDER = ['next_up', 'essential', 'later'];

// Every item, by group then order (shipped ones newest first at the end)
export async function listRoadmapItems(where: { status?: string } = {}) {
  const rows = await prisma.roadmapItem.findMany({ where, include: { _count: { select: { suggestions: true } } } });
  return rows.map(view).sort((a, b) =>
    (a.status === 'shipped' ? 1 : 0) - (b.status === 'shipped' ? 1 : 0)
    || (a.status === 'shipped' ? (b.shippedAt ?? '').localeCompare(a.shippedAt ?? '') : 0)
    || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    || a.sortOrder - b.sortOrder);
}

export async function loadRoadmapItem(id: string) {
  const r = await prisma.roadmapItem.findUnique({ where: { id }, include: { _count: { select: { suggestions: true } } } });
  return r ? view(r) : null;
}

// The suggestions folded into an item, most votes first
export async function linkedSuggestions(id: string) {
  const rows = await prisma.feedbackReport.findMany({
    where: { roadmapItemId: id },
    select: { id: true, number: true, title: true, status: true, user: { select: { name: true } }, followers: { select: { voted: true } } },
  });
  return rows
    .map(({ followers, user, ...r }) => ({ ...r, reporterName: user.name?.trim() || 'a tester', voteCount: 1 + followers.filter(f => f.voted).length }))
    .sort((a, b) => b.voteCount - a.voteCount || a.number - b.number);
}
