import type { Page } from '../services/pagination.js';

export interface PageView<Item> {
  items: Item[];
  pageNumber: number;
  startIndex: number;
  total?: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export type PageAction =
  | { type: 'cancel' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'select'; index: number };

export type PageActionPrompt<Item> = (view: PageView<Item>) => Promise<PageAction>;

export interface PageBrowser<Item> {
  select(): Promise<Item | null>;
}

interface PageBrowserOptions<Item, Token> {
  loadPage(token?: Token): Promise<Page<Item, Token>>;
  renderPage(view: PageView<Item>): void;
  chooseAction: PageActionPrompt<Item>;
}

interface CachedPage<Item, Token> {
  page: Page<Item, Token>;
  startIndex: number;
}

export function createPageBrowser<Item, Token>(
  options: PageBrowserOptions<Item, Token>,
): PageBrowser<Item> {
  const pages: Array<CachedPage<Item, Token>> = [];
  const loadedTokens = new Set<string>();
  let currentPageIndex = 0;

  const loadPage = async (index: number): Promise<CachedPage<Item, Token> | null> => {
    const cached = pages[index];
    if (cached) return cached;

    const previous = pages[index - 1];
    const token = previous?.page.nextToken ?? undefined;
    if (index > 0 && token === undefined) return null;

    const tokenKey = stableTokenKey(token);
    if (loadedTokens.has(tokenKey)) {
      if (previous) previous.page.nextToken = null;
      return null;
    }
    loadedTokens.add(tokenKey);

    const page = await options.loadPage(token);
    const loaded = {
      page,
      startIndex: previous
        ? previous.startIndex + previous.page.items.length
        : 0,
    };
    pages[index] = loaded;
    return loaded;
  };

  return {
    async select(): Promise<Item | null> {
      while (true) {
        const current = await loadPage(currentPageIndex);
        if (!current) return null;
        const view: PageView<Item> = {
          items: current.page.items,
          pageNumber: currentPageIndex + 1,
          startIndex: current.startIndex,
          ...(current.page.total === undefined ? {} : { total: current.page.total }),
          hasPrevious: currentPageIndex > 0,
          hasNext: current.page.nextToken !== null,
        };
        options.renderPage(view);
        if (view.items.length === 0 && !view.hasPrevious && !view.hasNext) return null;

        const action = await options.chooseAction(view);
        if (action.type === 'cancel') return null;
        if (action.type === 'previous') {
          if (view.hasPrevious) currentPageIndex -= 1;
          continue;
        }
        if (action.type === 'next') {
          if (view.hasNext) currentPageIndex += 1;
          continue;
        }
        return current.page.items[action.index] ?? null;
      }
    },
  };
}

function stableTokenKey(token: unknown): string {
  if (token === undefined) return 'first-page';
  if (typeof token !== 'object' || token === null) return `${typeof token}:${String(token)}`;
  return JSON.stringify(
    Object.entries(token as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}
