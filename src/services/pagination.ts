export interface Page<Item, Token> {
  items: Item[];
  nextToken: Token | null;
  total?: number;
}

export interface OffsetToken {
  offset: number;
}

export type RecentCursorToken =
  | { after: number; before?: never }
  | { after?: never; before: number };

export function nextOffsetToken(page: {
  next: string | null;
  offset: number;
  limit: number;
}): OffsetToken | null {
  if (!page.next) return null;
  if (!Number.isSafeInteger(page.offset) || page.offset < 0) return null;
  if (!Number.isSafeInteger(page.limit) || page.limit <= 0) return null;

  const offset = page.offset + page.limit;
  return Number.isSafeInteger(offset) && offset > page.offset ? { offset } : null;
}
