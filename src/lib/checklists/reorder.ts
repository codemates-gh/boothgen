/** Moves the item at `index` one step up (-1) or down (+1). Returns the same array when the move isn't possible. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** True when `order` names every id in `ids` exactly once (and nothing else). */
export function isCompleteOrder(order: unknown, ids: string[]): order is string[] {
  if (!Array.isArray(order) || order.length !== ids.length) return false;
  if (!order.every(id => typeof id === 'string')) return false;
  const seen = new Set(order as string[]);
  return seen.size === ids.length && ids.every(id => seen.has(id));
}
