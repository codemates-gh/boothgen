// Product roadmap choices (Super Admin → Reports → Roadmap, the Dev roadmap API and scripts/dev-roadmap.mjs)

export const ROADMAP_STATUSES = [
  { value: 'in_progress', label: 'In progress', badge: 'brand' },
  { value: 'testing', label: 'Testing', badge: 'warning' },
  { value: 'planned', label: 'Planned', badge: 'info' },
  { value: 'shipped', label: 'Shipped', badge: 'success' },
] as const;

export const ROADMAP_AREAS = [
  { value: 'genie_ipad', label: 'Genie iPad' },
  { value: 'boothgen', label: 'BoothGen' },
  { value: 'print_box', label: 'Print box' },
  { value: 'guest_pages', label: 'Guest pages' },
] as const;

// Order (sortOrder) applies within a group
export const ROADMAP_GROUPS = [
  { value: 'next_up', label: 'Next up' },
  { value: 'essential', label: 'Essential' },
  { value: 'later', label: 'Later' },
] as const;

type Opt = { value: string; label: string };
const labelOf = (list: readonly Opt[], v: string) => list.find(o => o.value === v)?.label ?? v;
export const roadmapStatusLabel = (v: string) => labelOf(ROADMAP_STATUSES, v);
export const roadmapAreaLabel = (v: string) => labelOf(ROADMAP_AREAS, v);
export const roadmapGroupLabel = (v: string) => labelOf(ROADMAP_GROUPS, v);
export const roadmapStatusBadge = (v: string) => (ROADMAP_STATUSES.find(s => s.value === v)?.badge ?? 'default') as any;

const values = <T extends readonly Opt[]>(list: T) => list.map(o => o.value) as unknown as [T[number]['value'], ...T[number]['value'][]];
export const ROADMAP_STATUS_VALUES = values(ROADMAP_STATUSES);
export const ROADMAP_AREA_VALUES = values(ROADMAP_AREAS);
export const ROADMAP_GROUP_VALUES = values(ROADMAP_GROUPS);
