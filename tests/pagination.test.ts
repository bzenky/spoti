import { describe, expect, it, vi } from 'vitest';

import {
  nextOffsetToken,
  type OffsetToken,
} from '../src/services/pagination.js';
import { createPageBrowser, type PageAction } from '../src/ui/pagination.js';

describe('nextOffsetToken', () => {
  it('accepts only safe, advancing offset metadata', () => {
    expect(nextOffsetToken({ next: 'next', offset: 20, limit: 10 })).toEqual({ offset: 30 });
    expect(nextOffsetToken({ next: null, offset: 20, limit: 10 })).toBeNull();
    expect(nextOffsetToken({ next: 'next', offset: 20, limit: 0 })).toBeNull();
    expect(nextOffsetToken({ next: 'next', offset: -1, limit: 10 })).toBeNull();
    expect(nextOffsetToken({ next: 'next', offset: Number.MAX_SAFE_INTEGER, limit: 1 })).toBeNull();
  });
});

describe('createPageBrowser', () => {
  it('loads forward pages once and reuses them when navigating backward and forward', async () => {
    const loadPage = vi
      .fn<(token?: OffsetToken) => Promise<{ items: string[]; nextToken: OffsetToken | null; total: number }>>()
      .mockResolvedValueOnce({ items: ['a', 'b'], nextToken: { offset: 2 }, total: 4 })
      .mockResolvedValueOnce({ items: ['c', 'd'], nextToken: null, total: 4 });
    const actions: PageAction[] = [
      { type: 'next' },
      { type: 'previous' },
      { type: 'next' },
      { type: 'select', index: 0 },
    ];
    const chooseAction = vi.fn(async () => actions.shift() ?? { type: 'cancel' as const });
    const rendered: number[] = [];
    const browser = createPageBrowser({
      loadPage,
      chooseAction,
      renderPage: (view) => rendered.push(view.pageNumber),
    });

    await expect(browser.select()).resolves.toBe('c');
    expect(loadPage).toHaveBeenNthCalledWith(1, undefined);
    expect(loadPage).toHaveBeenNthCalledWith(2, { offset: 2 });
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(rendered).toEqual([1, 2, 1, 2]);
  });

  it('continues past an empty mapped page and avoids prompting for a terminal empty result', async () => {
    const chooseAction = vi
      .fn()
      .mockResolvedValueOnce({ type: 'next' })
      .mockResolvedValueOnce({ type: 'select', index: 0 });
    const browser = createPageBrowser<string, OffsetToken>({
      loadPage: vi
        .fn()
        .mockResolvedValueOnce({ items: [], nextToken: { offset: 2 }, total: 3 })
        .mockResolvedValueOnce({ items: ['playable'], nextToken: null, total: 3 }),
      chooseAction,
      renderPage: vi.fn(),
    });

    await expect(browser.select()).resolves.toBe('playable');

    const terminalPrompt = vi.fn();
    const emptyBrowser = createPageBrowser<string, OffsetToken>({
      loadPage: async () => ({ items: [], nextToken: null, total: 0 }),
      chooseAction: terminalPrompt,
      renderPage: vi.fn(),
    });
    await expect(emptyBrowser.select()).resolves.toBeNull();
    expect(terminalPrompt).not.toHaveBeenCalled();
  });
});
