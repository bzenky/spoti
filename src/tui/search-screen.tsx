import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Album, Artist, Playlist, Track } from '../services/models.js';
import type { PlayerService } from '../services/player.service.js';
import type { SearchService } from '../services/search.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { isUnmodifiedKey, removeLastGrapheme } from './input.js';
import { createListWindow } from './viewport.js';

export type SearchCategory = 'track' | 'album' | 'artist' | 'playlist';

export type TuiSearch = Pick<
  SearchService,
  'searchAlbums' | 'searchArtists' | 'searchPlaylists' | 'searchTracks'
>;

export type SearchPlayer = Pick<PlayerService, 'playContext' | 'playTrack'>;

export interface SearchScreenProps {
  search: TuiSearch;
  player: SearchPlayer;
  sessionCache?: SearchSessionCache;
  availableRows?: number;
  onBack(): void;
  onExit(): void;
}

type SearchResult =
  | { category: 'track'; item: Track }
  | { category: 'album'; item: Album }
  | { category: 'artist'; item: Artist }
  | { category: 'playlist'; item: Playlist };

export type SearchSessionCache = Map<string, SearchResult[]>;

const CATEGORIES: readonly SearchCategory[] = ['track', 'album', 'artist', 'playlist'];
const CATEGORY_LABELS: Record<SearchCategory, string> = {
  track: 'Tracks',
  album: 'Albums',
  artist: 'Artists',
  playlist: 'Playlists',
};

export function SearchScreen({
  search,
  player,
  sessionCache,
  availableRows = 10,
  onBack,
  onExit,
}: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('track');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const localCache = useRef<SearchSessionCache>(new Map());
  const cache = sessionCache ?? localCache.current;
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const cancelRequest = useCallback(() => {
    requestVersion.current += 1;
    request.current?.abort();
    request.current = null;
    setLoading(false);
  }, []);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const editQuery = useCallback(
    (nextQuery: string) => {
      cancelRequest();
      setQuery(nextQuery);
      setResults(null);
      setSelectedIndex(0);
      setError(null);
      setConfirmation(null);
    },
    [cancelRequest],
  );

  const runSearch = useCallback(
    async (targetCategory = category, targetQuery = query) => {
      const normalizedQuery = targetQuery.trim();
      if (!normalizedQuery) return;

      cancelRequest();
      const cacheKey = `${targetCategory}:${normalizedQuery.toLocaleLowerCase()}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        setResults(cached);
        setSelectedIndex(0);
        return;
      }

      const controller = new AbortController();
      const version = requestVersion.current;
      request.current = controller;
      setLoading(true);
      setResults(null);
      setSelectedIndex(0);
      setError(null);
      setConfirmation(null);
      try {
        const loaded = await loadResults(search, targetCategory, normalizedQuery, controller.signal);
        if (controller.signal.aborted || version !== requestVersion.current) return;
        if (!cache.has(cacheKey) && cache.size >= 50) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) cache.delete(oldestKey);
        }
        cache.set(cacheKey, loaded);
        setResults(loaded);
      } catch (caught) {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setError(formatSearchError(caught));
      } finally {
        if (version === requestVersion.current) {
          request.current = null;
          setLoading(false);
        }
      }
    },
    [cache, cancelRequest, category, query, search],
  );

  const changeCategory = useCallback(
    (direction: -1 | 1) => {
      const currentIndex = CATEGORIES.indexOf(category);
      const nextCategory = CATEGORIES[(currentIndex + direction + CATEGORIES.length) % CATEGORIES.length];
      if (!nextCategory) return;
      setCategory(nextCategory);
      setResults(null);
      setSelectedIndex(0);
      setError(null);
      setConfirmation(null);
      if (query.trim()) void runSearch(nextCategory, query);
    },
    [category, query, runSearch],
  );

  const playSelected = useCallback(async () => {
    const selected = results?.[selectedIndex];
    if (!selected || playing) return;

    cancelRequest();
    const controller = new AbortController();
    const version = requestVersion.current;
    request.current = controller;
    setPlaying(true);
    setError(null);
    setConfirmation(null);
    try {
      if (selected.category === 'track') {
        await player.playTrack(selected.item.uri, controller.signal);
      } else {
        await player.playContext(selected.item.uri, controller.signal);
      }
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setConfirmation(`▶ Playing ${formatResult(selected)}`);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(formatSearchError(caught));
    } finally {
      if (version === requestVersion.current) {
        request.current = null;
        setPlaying(false);
      }
    }
  }, [cancelRequest, player, playing, results, selectedIndex]);

  useInput((input, key) => {
    if (key.ctrl && input === 'x') {
      cancelRequest();
      onExit();
      return;
    }
    if (key.escape) {
      cancelRequest();
      onBack();
      return;
    }
    if (key.ctrl || key.meta) return;
    if (key.tab || key.rightArrow) {
      changeCategory(1);
      return;
    }
    if (key.leftArrow) {
      changeCategory(-1);
      return;
    }
    if (key.upArrow && results?.length) {
      setSelectedIndex((current) => (current - 1 + results.length) % results.length);
      return;
    }
    if (key.downArrow && results?.length) {
      setSelectedIndex((current) => (current + 1) % results.length);
      return;
    }
    if (key.return) {
      if (results?.length) void playSelected();
      else void runSearch();
      return;
    }
    if (key.backspace || key.delete) {
      editQuery(removeLastGrapheme(query));
      return;
    }
    if (isUnmodifiedKey(input, key)) editQuery(`${query}${input}`);
  });

  const visibleResults = createListWindow(results ?? [], selectedIndex, availableRows);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Spotify search</Text>
      <Box marginTop={1} flexWrap="wrap" columnGap={2}>
        {CATEGORIES.map((entry) => (
          <Text
            key={entry}
            {...(entry === category ? { bold: true, color: 'green' as const } : { dimColor: true })}
          >
            {CATEGORY_LABELS[entry]}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} overflow="hidden">
        <Text wrap="truncate-start">Search: {sanitizeOneLineText(query)}▌</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {loading ? <Text color="yellow">Searching {CATEGORY_LABELS[category].toLowerCase()}…</Text> : null}
        {!loading && results?.length === 0 ? (
          <Text dimColor>No {CATEGORY_LABELS[category].toLowerCase()} found.</Text>
        ) : null}
        {!loading && visibleResults.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleResults.hiddenAbove} more</Text>
        ) : null}
        {!loading
          ? visibleResults.items.map((result, visibleIndex) => {
              const index = visibleResults.startIndex + visibleIndex;
              return (
                <Text
                  key={`${result.category}:${result.item.id}`}
                  wrap="truncate-end"
                  {...(index === selectedIndex ? { color: 'green' as const } : {})}
                >
                  {index === selectedIndex ? '›' : ' '} {formatResult(result)}
                </Text>
              );
            })
          : null}
        {!loading && visibleResults.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleResults.hiddenBelow} more</Text>
        ) : null}
      </Box>
      {playing ? <Text color="yellow">Starting playback…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>
          Type a query · Enter search/play · ↑/↓ select · Tab/←/→ category · Esc back
        </Text>
      </Box>
    </Box>
  );
}

async function loadResults(
  search: TuiSearch,
  category: SearchCategory,
  query: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  if (category === 'track') {
    return (await search.searchTracks(query, 10, signal)).map((item) => ({ category, item }));
  }
  if (category === 'album') {
    return (await search.searchAlbums(query, 10, signal)).map((item) => ({ category, item }));
  }
  if (category === 'artist') {
    return (await search.searchArtists(query, 10, signal)).map((item) => ({ category, item }));
  }
  return (await search.searchPlaylists(query, 10, signal)).map((item) => ({ category, item }));
}

function formatResult(result: SearchResult): string {
  const name = sanitizeOneLineText(result.item.name);
  if (result.category === 'artist') return name;
  if (result.category === 'playlist') {
    return `${name} — ${sanitizeOneLineText(result.item.ownerName)}`;
  }
  return `${name} — ${result.item.artists.map(sanitizeOneLineText).join(', ')}`;
}

function formatSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Spotify search failed. Try again.';
}
