import { describe, expect, it } from 'vitest';

import { createListWindow } from '../src/tui/viewport.js';

describe('createListWindow', () => {
  const items = ['one', 'two', 'three', 'four', 'five'];

  it('handles empty lists and unavailable rows', () => {
    expect(createListWindow([], 0, 5)).toEqual({
      items: [],
      startIndex: 0,
      hiddenAbove: 0,
      hiddenBelow: 0,
    });
    expect(createListWindow(items, 0, 0)).toEqual({
      items: [],
      startIndex: 0,
      hiddenAbove: 0,
      hiddenBelow: items.length,
    });
  });

  it('shows every item when all entries fit', () => {
    expect(createListWindow(items, 2, 5)).toEqual({
      items,
      startIndex: 0,
      hiddenAbove: 0,
      hiddenBelow: 0,
    });
  });

  it.each([
    [0, 0, ['one'], 0, 4],
    [2, 2, ['three'], 2, 2],
    [4, 4, ['five'], 4, 0],
  ] as const)(
    'keeps selection %s visible in a three-row viewport',
    (selectedIndex, startIndex, visible, hiddenAbove, hiddenBelow) => {
      expect(createListWindow(items, selectedIndex, 3)).toEqual({
        items: visible,
        startIndex,
        hiddenAbove,
        hiddenBelow,
      });
    },
  );

  it('bounds selections outside the list', () => {
    expect(createListWindow(items, -10, 4).items).toContain('one');
    expect(createListWindow(items, 99, 4).items).toContain('five');
  });
});
