import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LibraryService } from '../services/library.service.js';
import type { Playlist, Track } from '../services/models.js';
import type { OffsetToken, RecentCursorToken } from '../services/pagination.js';
import type { PlayerService } from '../services/player.service.js';
import type { PlaylistService } from '../services/playlist.service.js';
import type { RecentService } from '../services/recent.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export type LibraryCategory = 'playlists' | 'liked' | 'recent';

export type TuiPlaylistLibrary = Pick<
  PlaylistService,
  'getPlaylistItemsPage' | 'listPlaylistsPage'
>;
export type TuiLikedLibrary = Pick<LibraryService, 'getLikedTracksPage'>;
export type TuiRecentLibrary = Pick<RecentService, 'getRecentlyPlayedPage'>;
export type LibraryPlayer = Pick<PlayerService, 'playTrack'>;

export interface LibraryScreenProps {
  playlists: TuiPlaylistLibrary;
  library: TuiLikedLibrary;
  recent: TuiRecentLibrary;
  player: LibraryPlayer;
  sessionCache?: LibrarySessionCache;
  availableRows?: number;
  onBack(): void;
  onExit?(): void;
}

type Location =
  | { kind: 'category'; category: LibraryCategory }
  | { kind: 'playlist'; playlist: Playlist };

type PageToken = OffsetToken | RecentCursorToken;
type DisplayRow =
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'track'; track: Track; detail?: string };

interface CachedPage {
  rows: DisplayRow[];
  nextToken: PageToken | null;
}

interface PageSession {
  pages: CachedPage[];
  index: number;
}

export type LibrarySessionCache = Map<string, PageSession>;

const CATEGORIES: readonly LibraryCategory[] = ['playlists', 'liked', 'recent'];
const LABELS: Record<LibraryCategory, string> = {
  playlists: 'Playlists',
  liked: 'Liked',
  recent: 'Recent',
};
const LIBRARY_PAGE_SIZE = 20;
const PLAYLIST_TRACK_PAGE_SIZE = 50;

export function LibraryScreen({
  playlists,
  library,
  recent,
  player,
  sessionCache,
  availableRows = 10,
  onBack,
  onExit,
}: LibraryScreenProps) {
  const [location, setLocation] = useState<Location>({ kind: 'category', category: 'playlists' });
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<CachedPage | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const localSessions = useRef<LibrarySessionCache>(new Map());
  const sessions = sessionCache ?? localSessions.current;
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const locationKey = getLocationKey(location);

  const cancelRequest = useCallback(() => {
    requestVersion.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);

  useEffect(() => {
    const version = ++requestVersion.current;
    request.current?.abort();
    request.current = null;
    setSelectedIndex(0);
    setError(null);
    setConfirmation(null);

    const session = getSession(sessions, locationKey);
    const cached = session.pages[pageIndex];
    if (cached) {
      session.index = pageIndex;
      setPage(cached);
      setLoading(false);
      return;
    }

    const token = pageIndex === 0 ? undefined : session.pages[pageIndex - 1]?.nextToken;
    if (pageIndex > 0 && !token) {
      setPage(session.pages[session.index] ?? null);
      setLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    request.current = controller;
    setPage(null);
    setLoading(true);

    const load = async () => {
      try {
        const loaded = await loadPage(
          location,
          token ?? undefined,
          playlists,
          library,
          recent,
          controller.signal,
        );
        if (controller.signal.aborted || !active || version !== requestVersion.current) return;
        session.pages[pageIndex] = loaded;
        session.index = pageIndex;
        setPage(loaded);
      } catch (caught) {
        if (controller.signal.aborted || !active || version !== requestVersion.current) return;
        setError(`Unable to load ${getLocationLabel(location).toLowerCase()}: ${formatError(caught)}`);
      } finally {
        if (active && version === requestVersion.current) {
          request.current = null;
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
      requestVersion.current += 1;
      request.current?.abort();
      request.current = null;
    };
  }, [library, location, locationKey, pageIndex, playlists, recent, retryVersion, sessions]);

  const changeCategory = useCallback(
    (direction: -1 | 1) => {
      if (location.kind !== 'category' || loading || playing) return;
      const current = CATEGORIES.indexOf(location.category);
      const category = CATEGORIES[(current + direction + CATEGORIES.length) % CATEGORIES.length];
      if (!category) return;
      const nextLocation: Location = { kind: 'category', category };
      setLocation(nextLocation);
      setPageIndex(getSession(sessions, getLocationKey(nextLocation)).index);
    },
    [loading, location, playing, sessions],
  );

  const goBack = useCallback(() => {
    cancelRequest();
    setPlaying(false);
    if (location.kind === 'playlist') {
      const nextLocation: Location = { kind: 'category', category: 'playlists' };
      setLocation(nextLocation);
      setPageIndex(getSession(sessions, getLocationKey(nextLocation)).index);
      return;
    }
    onBack();
  }, [cancelRequest, location.kind, onBack, sessions]);

  const playSelected = useCallback(async () => {
    const selected = page?.rows[selectedIndex];
    if (!selected || selected.kind !== 'track' || playing) return;

    cancelRequest();
    const controller = new AbortController();
    const version = requestVersion.current;
    request.current = controller;
    setPlaying(true);
    setError(null);
    setConfirmation(null);
    try {
      await player.playTrack(selected.track.uri, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setConfirmation(`▶ Playing ${formatTrack(selected.track)}`);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(`Unable to start playback: ${formatError(caught)}`);
    } finally {
      if (version === requestVersion.current) {
        request.current = null;
        setPlaying(false);
      }
    }
  }, [cancelRequest, page, player, playing, selectedIndex]);

  useInput((input, key) => {
    if (key.ctrl && input === 'x') {
      cancelRequest();
      onExit?.();
      return;
    }
    if (key.escape) {
      goBack();
      return;
    }
    if (key.ctrl || key.meta) return;
    if (loading || playing) return;
    if (error && (input === 'r' || key.return)) {
      setRetryVersion((current) => current + 1);
      return;
    }
    if (location.kind === 'category' && (key.tab || key.rightArrow)) {
      changeCategory(1);
      return;
    }
    if (location.kind === 'category' && key.leftArrow) {
      changeCategory(-1);
      return;
    }
    if (key.upArrow && page?.rows.length) {
      setSelectedIndex((current) => (current - 1 + page.rows.length) % page.rows.length);
      return;
    }
    if (key.downArrow && page?.rows.length) {
      setSelectedIndex((current) => (current + 1) % page.rows.length);
      return;
    }
    if (input === 'n' && page?.nextToken) {
      setPageIndex((current) => current + 1);
      return;
    }
    if (input === 'p' && pageIndex > 0) {
      setPageIndex((current) => current - 1);
      return;
    }
    if (key.return) {
      const selected = page?.rows[selectedIndex];
      if (selected?.kind === 'playlist') {
        const nextLocation: Location = { kind: 'playlist', playlist: selected.playlist };
        setLocation(nextLocation);
        setPageIndex(getSession(sessions, getLocationKey(nextLocation)).index);
      } else {
        void playSelected();
      }
    }
  });

  const hasPrevious = pageIndex > 0;
  const hasNext = Boolean(page?.nextToken);
  const visibleRows = createListWindow(page?.rows ?? [], selectedIndex, availableRows);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>{location.kind === 'playlist' ? sanitizeOneLineText(location.playlist.name) : 'Library'}</Text>
      {location.kind === 'category' ? (
        <Box marginTop={1} flexWrap="wrap" columnGap={2}>
          {CATEGORIES.map((category) => (
            <Text
              key={category}
              {...(category === location.category
                ? { bold: true, color: 'green' as const }
                : { dimColor: true })}
            >
              {LABELS[category]}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>Playlist tracks</Text>
      )}

      <Box marginTop={1} flexDirection="column">
        {loading ? <Text color="yellow">Loading {getLocationLabel(location).toLowerCase()}…</Text> : null}
        {!loading && !error && page?.rows.length === 0 ? (
          <Text dimColor>No {getLocationLabel(location).toLowerCase()} found.</Text>
        ) : null}
        {!loading && !error && visibleRows.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleRows.hiddenAbove} more</Text>
        ) : null}
        {!loading && !error
          ? visibleRows.items.map((row, visibleIndex) => {
              const index = visibleRows.startIndex + visibleIndex;
              return (
                <Text
                  key={`${getRowKey(row)}:${index}`}
                  wrap="truncate-end"
                  {...(index === selectedIndex ? { color: 'green' as const } : {})}
                >
                  {index === selectedIndex ? '›' : ' '} {formatRow(row)}
                </Text>
              );
            })
          : null}
        {!loading && !error && visibleRows.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleRows.hiddenBelow} more</Text>
        ) : null}
      </Box>

      {error ? (
        <Box flexDirection="column">
          <Text color="red">{error}</Text>
          <Text dimColor>Press r or Enter to retry.</Text>
        </Box>
      ) : null}
      {playing ? <Text color="yellow">Starting playback…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      {!loading && !error ? (
        <Text dimColor>
          Page {pageIndex + 1} · {hasPrevious ? 'p previous' : 'p unavailable'} ·{' '}
          {hasNext ? 'n next' : 'n unavailable'}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          Enter {location.kind === 'playlist' ? 'play' : location.category === 'playlists' ? 'open/play' : 'play'} · ↑/↓ select · n/p page
          {location.kind === 'category' ? ' · Tab/←/→ category' : ''} · Esc back
        </Text>
      </Box>
    </Box>
  );
}

function getSession(sessions: Map<string, PageSession>, key: string): PageSession {
  const existing = sessions.get(key);
  if (existing) return existing;
  const session: PageSession = { pages: [], index: 0 };
  sessions.set(key, session);
  return session;
}

function getLocationKey(location: Location): string {
  return location.kind === 'category' ? location.category : `playlist:${location.playlist.id}`;
}

function getLocationLabel(location: Location): string {
  return location.kind === 'category' ? LABELS[location.category] : 'playlist tracks';
}

async function loadPage(
  location: Location,
  token: PageToken | undefined,
  playlists: TuiPlaylistLibrary,
  library: TuiLikedLibrary,
  recent: TuiRecentLibrary,
  signal: AbortSignal,
): Promise<CachedPage> {
  if (location.kind === 'playlist') {
    const loaded = await playlists.getPlaylistItemsPage(
      location.playlist.id,
      token as OffsetToken | undefined,
      PLAYLIST_TRACK_PAGE_SIZE,
      signal,
    );
    return { rows: loaded.items.map((track) => ({ kind: 'track', track })), nextToken: loaded.nextToken };
  }
  if (location.category === 'playlists') {
    const loaded = await playlists.listPlaylistsPage(
      token as OffsetToken | undefined,
      LIBRARY_PAGE_SIZE,
      signal,
    );
    return {
      rows: loaded.items.map((playlist) => ({ kind: 'playlist', playlist })),
      nextToken: loaded.nextToken,
    };
  }
  if (location.category === 'liked') {
    const loaded = await library.getLikedTracksPage(
      token as OffsetToken | undefined,
      LIBRARY_PAGE_SIZE,
      signal,
    );
    return {
      rows: loaded.items.map(({ addedAt, track }) => ({ kind: 'track', track, detail: `liked ${addedAt}` })),
      nextToken: loaded.nextToken,
    };
  }
  const loaded = await recent.getRecentlyPlayedPage(
    token as RecentCursorToken | undefined,
    LIBRARY_PAGE_SIZE,
    signal,
  );
  return {
    rows: loaded.items.map(({ playedAt, track }) => ({ kind: 'track', track, detail: `played ${playedAt}` })),
    nextToken: loaded.nextToken,
  };
}

function getRowKey(row: DisplayRow): string {
  return row.kind === 'playlist' ? `playlist:${row.playlist.id}` : `track:${row.track.id}`;
}

function formatRow(row: DisplayRow): string {
  if (row.kind === 'playlist') {
    const count = `${row.playlist.totalTracks} ${row.playlist.totalTracks === 1 ? 'track' : 'tracks'}`;
    return `${sanitizeOneLineText(row.playlist.name)} — ${sanitizeOneLineText(row.playlist.ownerName)} · ${count}`;
  }
  const detail = row.detail ? ` · ${sanitizeOneLineText(row.detail)}` : '';
  return `${formatTrack(row.track)}${detail}`;
}

function formatTrack(track: Track): string {
  const artists = track.artists.map(sanitizeOneLineText).join(', ');
  return `${sanitizeOneLineText(track.name)} — ${artists}`;
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Spotify request failed. Try again.';
}
