import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';

import type { Album, Artist, Playlist, Track } from '../services/models.js';
import type { PlayerService } from '../services/player.service.js';
import type { SearchService } from '../services/search.service.js';
import { toError } from '../utils/errors.js';
import {
  formatAlbum,
  formatArtist,
  formatPlaylist,
  formatTrack,
  plainOutputStyles,
  sanitizeOneLineText,
  type OutputStyles,
} from './output.js';

export type SearchCategory = 'track' | 'album' | 'artist' | 'playlist';

export type InteractiveSearchKey =
  | { type: 'character'; value: string }
  | { type: 'backspace' | 'enter' | 'escape' | 'up' | 'down' | 'left' | 'right' | 'tab' | 'other' };

export interface InteractiveSearchTerminal {
  readonly isTTY: boolean;
  setup(): void;
  cleanup(): void;
  readKey(signal?: AbortSignal): Promise<InteractiveSearchKey>;
  write(value: string): void;
}

export interface InteractiveSearchServices {
  search: Pick<
    SearchService,
    'searchTracks' | 'searchAlbums' | 'searchArtists' | 'searchPlaylists'
  >;
  player: Pick<PlayerService, 'playTrack' | 'playContext'>;
}

export interface InteractiveSearchOptions extends InteractiveSearchServices {
  terminal?: InteractiveSearchTerminal;
  limit?: number;
  styles?: OutputStyles;
}

export type InteractiveSearchResult =
  | { status: 'not-interactive' | 'cancelled' }
  | { status: 'played'; category: SearchCategory; uri: string; label: string };

type SearchItem = Track | Album | Artist | Playlist;

const CATEGORIES: readonly SearchCategory[] = ['track', 'album', 'artist', 'playlist'];
const CATEGORY_LABELS: Record<SearchCategory, string> = {
  track: 'Tracks',
  album: 'Albums',
  artist: 'Artists',
  playlist: 'Playlists',
};

const CLEAR_SCREEN = '\u001B[2J\u001B[H';

export async function runInteractiveSearch(
  options: InteractiveSearchOptions,
): Promise<InteractiveSearchResult> {
  const terminal = options.terminal ?? createNodeInteractiveSearchTerminal();
  if (!terminal.isTTY) return { status: 'not-interactive' };

  const styles = options.styles ?? plainOutputStyles;
  const cache = new Map<string, SearchItem[]>();
  let query = '';
  let category: SearchCategory = 'track';
  let items: SearchItem[] | null = null;
  let selectedIndex = 0;
  let submitted = false;
  let errorMessage: string | null = null;
  const finish = (result: InteractiveSearchResult): InteractiveSearchResult => {
    terminal.cleanup();
    return result;
  };

  try {
    terminal.setup();
    render(terminal, { query, category, items, selectedIndex, submitted, errorMessage, styles });

    while (true) {
      const key = await terminal.readKey();
      if (key.type === 'escape') return finish({ status: 'cancelled' });

      if (key.type === 'character') {
        query += key.value;
        items = null;
        selectedIndex = 0;
        submitted = false;
        errorMessage = null;
        cache.clear();
      } else if (key.type === 'backspace') {
        query = removeLastCharacter(query);
        items = null;
        selectedIndex = 0;
        submitted = false;
        errorMessage = null;
        cache.clear();
      } else if (isCategoryKey(key)) {
        category = moveCategory(category, key.type === 'left' ? -1 : 1);
        selectedIndex = 0;
        errorMessage = null;
        if (submitted && query.trim()) {
          const result = await loadResults(terminal, options, cache, query, category);
          if (result.status === 'cancelled') return finish({ status: 'cancelled' });
          items = result.items;
          errorMessage = result.errorMessage;
        } else {
          items = null;
        }
      } else if (key.type === 'enter' && items === null && query.trim()) {
        submitted = true;
        const result = await loadResults(terminal, options, cache, query, category);
        if (result.status === 'cancelled') return finish({ status: 'cancelled' });
        items = result.items;
        errorMessage = result.errorMessage;
        selectedIndex = 0;
      } else if (key.type === 'up' && items && items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        errorMessage = null;
      } else if (key.type === 'down' && items && items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
        errorMessage = null;
      } else if (key.type === 'enter' && items && items.length > 0) {
        const selected = items[selectedIndex];
        if (!selected) continue;
        renderStartingPlayback(terminal, selected, category, styles);
        const playback = await runCancellableOperation(terminal, (signal) =>
          category === 'track'
            ? options.player.playTrack(selected.uri, signal)
            : options.player.playContext(selected.uri, signal),
        );
        if (playback.status === 'cancelled') return finish({ status: 'cancelled' });
        if (playback.status === 'failed') {
          errorMessage = sanitizeOneLineText(toError(playback.error).message) || 'Playback failed.';
        } else {
          return finish({
            status: 'played',
            category,
            uri: selected.uri,
            label: playbackLabel(selected, category),
          });
        }
      }

      render(terminal, { query, category, items, selectedIndex, submitted, errorMessage, styles });
    }
  } catch (error) {
    try {
      terminal.cleanup();
    } catch {
      // Preserve the original setup, rendering, search, or playback error.
    }
    throw error;
  }
}

export function createNodeInteractiveSearchTerminal(): InteractiveSearchTerminal {
  let wasRaw = false;
  let rawModeChanged = false;
  let inputResumed = false;
  let screenOpened = false;
  let cleanedUp = true;

  return {
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    setup() {
      if (!cleanedUp) return;
      cleanedUp = false;
      wasRaw = Boolean(stdin.isRaw);
      emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      rawModeChanged = true;
      stdin.resume();
      inputResumed = true;
      screenOpened = true;
      stdout.write('\u001B[?1049h\u001B[?25l');
    },
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      let firstError: unknown;

      if (rawModeChanged && stdin.isTTY) {
        try {
          stdin.setRawMode(wasRaw);
        } catch (error) {
          firstError = error;
        }
      }
      rawModeChanged = false;

      if (inputResumed) {
        try {
          stdin.pause();
        } catch (error) {
          firstError ??= error;
        }
      }
      inputResumed = false;

      if (screenOpened) {
        try {
          stdout.write('\u001B[?25h\u001B[?1049l');
        } catch (error) {
          firstError ??= error;
        }
      }
      screenOpened = false;
      if (firstError !== undefined) throw firstError;
    },
    readKey(signal) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (key: InteractiveSearchKey) => {
          if (settled) return;
          settled = true;
          stdin.removeListener('keypress', listener);
          signal?.removeEventListener('abort', abortListener);
          resolve(key);
        };
        const listener = (character: string | undefined, key: NodeKey = {}) => {
          finish(mapNodeKey(character, key));
        };
        const abortListener = () => finish({ type: 'other' });

        if (signal?.aborted) {
          abortListener();
          return;
        }
        stdin.once('keypress', listener);
        signal?.addEventListener('abort', abortListener, { once: true });
      });
    },
    write(value) {
      stdout.write(value);
    },
  };
}

interface ViewState {
  query: string;
  category: SearchCategory;
  items: SearchItem[] | null;
  selectedIndex: number;
  submitted: boolean;
  errorMessage: string | null;
  styles: OutputStyles;
}

function render(terminal: InteractiveSearchTerminal, state: ViewState): void {
  const categoryBar = CATEGORIES.map((entry) =>
    entry === state.category
      ? state.styles.heading(`[${CATEGORY_LABELS[entry]}]`)
      : CATEGORY_LABELS[entry],
  ).join('  ');
  const lines = [
    state.styles.heading('Spotify search'),
    '',
    categoryBar,
    '',
    `Search: ${sanitizeOneLineText(state.query)}${state.items === null ? '▌' : ''}`,
    '',
  ];

  if (state.errorMessage) {
    lines.push(`Error: ${state.errorMessage}`, '');
  }

  if (state.items === null) {
    lines.push(
      state.submitted
        ? 'Press Enter to retry. Type to edit the query; Tab changes category; Esc exits.'
        : 'Type a query and press Enter. Tab changes category; Esc exits.',
    );
  } else if (state.items.length === 0) {
    lines.push(`No ${CATEGORY_LABELS[state.category].toLowerCase()} found for "${sanitizeOneLineText(state.query.trim())}".`);
    lines.push('', 'Type to edit the query; Tab changes category; Esc exits.');
  } else {
    lines.push(
      ...state.items.map((item, index) =>
        `${index === state.selectedIndex ? '›' : ' '} ${formatItem(item, state.category, state.styles)}`,
      ),
      '',
      '↑/↓ selects; Enter plays; type to edit; Tab changes category; Esc exits.',
    );
  }

  terminal.write(`${CLEAR_SCREEN}${lines.join('\n')}\n`);
}

type LoadResultsResult =
  | { status: 'cancelled' }
  | { status: 'loaded'; items: SearchItem[] | null; errorMessage: string | null };

async function loadResults(
  terminal: InteractiveSearchTerminal,
  options: InteractiveSearchOptions,
  cache: Map<string, SearchItem[]>,
  query: string,
  category: SearchCategory,
): Promise<LoadResultsResult> {
  const key = `${category}:${query.trim().toLocaleLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return { status: 'loaded', items: cached, errorMessage: null };

  renderSearching(terminal, query, category, options.styles ?? plainOutputStyles);
  const result = await runCancellableOperation(terminal, (signal) =>
    search(options.search, category, query, options.limit, signal),
  );
  if (result.status === 'cancelled') return result;
  if (result.status === 'failed') {
    return {
      status: 'loaded',
      items: null,
      errorMessage: sanitizeOneLineText(toError(result.error).message) || 'Search failed.',
    };
  }
  cache.set(key, result.value);
  return { status: 'loaded', items: result.value, errorMessage: null };
}

function renderSearching(
  terminal: InteractiveSearchTerminal,
  query: string,
  category: SearchCategory,
  styles: OutputStyles,
): void {
  terminal.write(
    `${CLEAR_SCREEN}${styles.heading(`Searching ${CATEGORY_LABELS[category].toLowerCase()}`)} for "${sanitizeOneLineText(query.trim())}"…\n\nEsc cancels and exits.\n`,
  );
}

function renderStartingPlayback(
  terminal: InteractiveSearchTerminal,
  item: SearchItem,
  category: SearchCategory,
  styles: OutputStyles,
): void {
  terminal.write(
    `${CLEAR_SCREEN}${styles.heading('Starting playback')}\n\n${formatItem(item, category, styles)}\n`,
  );
}

async function search(
  service: InteractiveSearchServices['search'],
  category: SearchCategory,
  query: string,
  limit: number | undefined,
  signal: AbortSignal,
): Promise<SearchItem[]> {
  if (category === 'track') return service.searchTracks(query, limit, signal);
  if (category === 'album') return service.searchAlbums(query, limit, signal);
  if (category === 'artist') return service.searchArtists(query, limit, signal);
  return service.searchPlaylists(query, limit, signal);
}

interface CompletedOperation<Result> {
  status: 'completed';
  value: Result;
}

interface FailedOperation {
  status: 'failed';
  error: unknown;
}

type CancellableOperation<Result> =
  | CompletedOperation<Result>
  | FailedOperation
  | { status: 'cancelled' };

async function runCancellableOperation<Result>(
  terminal: InteractiveSearchTerminal,
  operation: (signal: AbortSignal) => Promise<Result>,
): Promise<CancellableOperation<Result>> {
  const operationController = new AbortController();
  const operationResult = operation(operationController.signal).then(
    (value): CompletedOperation<Result> => ({ status: 'completed', value }),
    (error: unknown): FailedOperation => ({ status: 'failed', error }),
  );

  while (true) {
    const keyController = new AbortController();
    const keyResult = terminal.readKey(keyController.signal).then((key) => ({
      status: 'key' as const,
      key,
    }));
    const result = await Promise.race([operationResult, keyResult]);
    if (result.status !== 'key') {
      keyController.abort();
      return result;
    }
    if (result.key.type === 'escape') {
      operationController.abort();
      return { status: 'cancelled' };
    }
  }
}

function formatItem(
  item: SearchItem,
  category: SearchCategory,
  styles: OutputStyles,
): string {
  if (category === 'track') return formatTrack(item as Track, undefined, styles);
  if (category === 'album') return formatAlbum(item as Album, undefined, styles);
  if (category === 'artist') return formatArtist(item as Artist, undefined, styles);
  return formatPlaylist(item as Playlist, undefined, styles);
}

function playbackLabel(item: SearchItem, category: SearchCategory): string {
  if (category === 'track') {
    const track = item as Track;
    return `${sanitizeOneLineText(track.name)} — ${track.artists.map(sanitizeOneLineText).join(', ')}`;
  }
  return sanitizeOneLineText(item.name);
}

function removeLastCharacter(value: string): string {
  return Array.from(value).slice(0, -1).join('');
}

function isCategoryKey(
  key: InteractiveSearchKey,
): key is InteractiveSearchKey & { type: 'tab' | 'left' | 'right' } {
  return key.type === 'tab' || key.type === 'left' || key.type === 'right';
}

function moveCategory(category: SearchCategory, offset: number): SearchCategory {
  const currentIndex = CATEGORIES.indexOf(category);
  return CATEGORIES[(currentIndex + offset + CATEGORIES.length) % CATEGORIES.length] ?? 'track';
}

interface NodeKey {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
}

function mapNodeKey(character: string | undefined, key: NodeKey): InteractiveSearchKey {
  if (key.name === 'escape' || (key.ctrl && key.name === 'c')) return { type: 'escape' };
  if (key.name === 'return' || key.name === 'enter') return { type: 'enter' };
  if (key.name === 'backspace') return { type: 'backspace' };
  if (key.name === 'up') return { type: 'up' };
  if (key.name === 'down') return { type: 'down' };
  if (key.name === 'left') return { type: 'left' };
  if (key.name === 'right') return { type: 'right' };
  if (key.name === 'tab') return { type: 'tab' };
  if (!key.ctrl && !key.meta && character && isPrintable(character)) {
    return { type: 'character', value: character };
  }
  return { type: 'other' };
}

function isPrintable(value: string): boolean {
  return Array.from(value).every((character) => character >= ' ' && character !== '\u007F');
}
