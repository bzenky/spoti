export interface ListWindow<Item> {
  items: Item[];
  startIndex: number;
  hiddenAbove: number;
  hiddenBelow: number;
}

export function createListWindow<Item>(
  items: readonly Item[],
  selectedIndex: number,
  availableRows: number,
): ListWindow<Item> {
  if (items.length === 0 || availableRows <= 0) {
    return { items: [], startIndex: 0, hiddenAbove: 0, hiddenBelow: items.length };
  }

  const indicatorRows = items.length > availableRows ? Math.min(2, Math.max(0, availableRows - 1)) : 0;
  const visibleCount = Math.max(1, availableRows - indicatorRows);
  const boundedSelection = Math.min(items.length - 1, Math.max(0, selectedIndex));
  const maximumStart = Math.max(0, items.length - visibleCount);
  const startIndex = Math.min(maximumStart, Math.max(0, boundedSelection - Math.floor(visibleCount / 2)));
  const visibleItems = items.slice(startIndex, startIndex + visibleCount);

  return {
    items: visibleItems,
    startIndex,
    hiddenAbove: startIndex,
    hiddenBelow: Math.max(0, items.length - startIndex - visibleItems.length),
  };
}
