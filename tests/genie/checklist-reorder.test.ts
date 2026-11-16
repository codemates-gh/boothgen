import { describe, expect, it } from 'vitest';
import { isCompleteOrder, moveItem } from '@/lib/checklists/reorder';

describe('moveItem', () => {
  it('swaps an item with its neighbour', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns the same list when the item is already at the edge', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 5, 1)).toBe(list);
  });
});

describe('isCompleteOrder', () => {
  it('accepts every id exactly once, in any order', () => {
    expect(isCompleteOrder(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(isCompleteOrder([], [])).toBe(true);
  });

  it('rejects missing, extra, repeated or non-string ids', () => {
    expect(isCompleteOrder(['a'], ['a', 'b'])).toBe(false);
    expect(isCompleteOrder(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(isCompleteOrder(['a', 'a'], ['a', 'b'])).toBe(false);
    expect(isCompleteOrder(['a', 1], ['a', 'b'])).toBe(false);
    expect(isCompleteOrder('a,b', ['a', 'b'])).toBe(false);
  });
});
