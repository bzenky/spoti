import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';

import type { Album, Artist, Playlist, Track } from '../services/models.js';
import type { PlayerService } from '../services/player.service.js';
import type { SearchService } from '../services/search.service.js';
import { formatAlbum, formatArtist, formatPlaylist, formatTrack } from './output.js';

export type SearchCategory = 'track' | 'album' | 'artist' | 'playlist';

export type InteractiveSearchKey =
  | { type: 'character'; value: string }
  | { type: 'backspace' | 'enter' | 'escape' | 'up' | 'down' | 'left' | 'right' | 'tab' | 'other' };

export interface InteractiveSearchTerminal {
  readonly isTTY: boolean;
  setup(): void;
  cleanup(): void;
  readKey(): Promise<InteractiveSearchKey>;
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
}

export type InteractiveSearchResult =
  | { status: 'not-interactive' | 'cancelled' }
  | { status: 'played'; category: SearchCategory; uri: string };

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

  let query = '';
  let category: SearchCategory = 'track';
  let items: SearchItem[] | null = null;
  let selectedIndex = 0;

  terminal.setup();
  try {
    render(terminal, { query, category, items, selectedIndex });

    while (true) {
      const key = await terminal.readKey();
      if (key.type === 'escape') return { status: 'cancelled' };

      if (items === null) {
        if (key.type === 'character') query += key.value;
        else if (key.type === 'backspace') query = query.slice(0, -1);
        else if (isCategoryKey(key)) category = moveCategory(category, key.type === 'left' ? -1 : 1);
        else if (key.type === 'enter' && query.trim()) {
          renderSearching(terminal, query, category);
          items = await search(options.search, category, query, options.limit);
          selectedIndex = 0;
        }
      } else if (isCategoryKey(key)) {
        category = moveCategory(category, key.type === 'left' ? -1 : 1);
        renderSearching(terminal, query, category);
        items = await search(options.search, category, query, options.limit);
        selectedIndex = 0;
      } else if (key.type === 'up' && items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      } else if (key.type === 'down' && items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
      } else if (key.type === 'enter' && items.length > 0) {
        const selected = items[selectedIndex];
        if (!selected) continue;
        if (category === 'track') await options.player.playTrack(selected.uri);
        else await options.player.playContext(selected.uri);
        return { status: 'played', category, uri: selected.uri };
      }

      render(terminal, { query, category, items, selectedIndex });
    }
  } finally {
    terminal.cleanup();
  }
}

export function createNodeInteractiveSearchTerminal(): InteractiveSearchTerminal {
  let wasRaw = false;

  return {
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    setup() {
      wasRaw = Boolean(stdin.isRaw);
      emitKeypressEvents(stdin);
      stdin.setRawMode(true);
      stdin.resume();
      stdout.write('\u001B[?1049h\u001B[?25l');
    },
    cleanup() {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\u001B[?25h\u001B[?1049l');
    },
    readKey() {
      return new Promise((resolve) => {
        const listener = (character: string | undefined, key: NodeKey = {}) => {
          resolve(mapNodeKey(character, key));
        };
        stdin.once('keypress', listener);
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
}

function render(terminal: InteractiveSearchTerminal, state: ViewState): void {
  const categoryBar = CATEGORIES.map((entry) =>
    entry === state.category ? `[${CATEGORY_LABELS[entry]}]` : CATEGORY_LABELS[entry],
  ).join('  ');
  const lines = [
    'Spotify search',
    '',
    `${categoryBar}`,
    '',
    `Search: ${state.query}${state.items === null ? '▌' : ''}`,
    '',
  ];

  if (state.items === null) {
    lines.push('Type a query and press Enter. Tab switches category; Esc exits.');
  } else if (state.items.length === 0) {
    lines.push(`No ${CATEGORY_LABELS[state.category].toLowerCase()} found for "${state.query.trim()}".`);
    lines.push('', 'Tab switches category; Esc exits.');
  } else {
    lines.push(
      ...state.items.map((item, index) =>
        `${index === state.selectedIndex ? '›' : ' '} ${formatItem(item, state.category)}`,
      ),
      '',
      '↑/↓ selects; Tab switches category; Enter plays; Esc exits.',
    );
  }

  terminal.write(`${CLEAR_SCREEN}${lines.join('\n')}\n`);
}

function renderSearching(
  terminal: InteractiveSearchTerminal,
  query: string,
  category: SearchCategory,
): void {
  terminal.write(
    `${CLEAR_SCREEN}Searching ${CATEGORY_LABELS[category].toLowerCase()} for "${query.trim()}"…\n`,
  );
}

async function search(
  service: InteractiveSearchServices['search'],
  category: SearchCategory,
  query: string,
  limit: number | undefined,
): Promise<SearchItem[]> {
  if (category === 'track') return service.searchTracks(query, limit);
  if (category === 'album') return service.searchAlbums(query, limit);
  if (category === 'artist') return service.searchArtists(query, limit);
  return service.searchPlaylists(query, limit);
}

function formatItem(item: SearchItem, category: SearchCategory): string {
  if (category === 'track') return formatTrack(item as Track);
  if (category === 'album') return formatAlbum(item as Album);
  if (category === 'artist') return formatArtist(item as Artist);
  return formatPlaylist(item as Playlist);
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
