import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthService } from '../services/auth.service.js';
import type { LibraryService } from '../services/library.service.js';
import type { Playlist, PlaylistDetailsChanges, Track } from '../services/models.js';
import type { OffsetToken, RecentCursorToken } from '../services/pagination.js';
import type { PlayerService } from '../services/player.service.js';
import type { PlaylistService } from '../services/playlist.service.js';
import type { RecentService } from '../services/recent.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export type LibraryCategory = 'playlists' | 'liked' | 'recent';

export type TuiPlaylistLibrary = Pick<
  PlaylistService,
  'getPlaylistItemsPage' | 'listPlaylistsPage' | 'updatePlaylistDetails' | 'moveItem'
>;
export type TuiLibraryAuth = Pick<AuthService, 'getCurrentUser'>;
export type TuiLikedLibrary = Pick<LibraryService, 'getLikedTracksPage'>;
export type TuiRecentLibrary = Pick<RecentService, 'getRecentlyPlayedPage'>;
export type LibraryPlayer = Pick<PlayerService, 'playTrack'>;

export interface LibraryScreenProps {
  playlists: TuiPlaylistLibrary;
  auth: TuiLibraryAuth;
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
  auth,
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
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState<'menu' | 'name' | 'description' | 'visibility' | 'move-target' | null>(null);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
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
    setSaving(false);
    setEditMode(null);
    draftRef.current = '';
    setDraft('');
    if (location.kind === 'playlist') {
      const nextLocation: Location = { kind: 'category', category: 'playlists' };
      setLocation(nextLocation);
      setPageIndex(getSession(sessions, getLocationKey(nextLocation)).index);
      return;
    }
    onBack();
  }, [cancelRequest, location.kind, onBack, sessions]);

  const updateCachedPlaylist = useCallback((updated: Playlist) => {
    for (const session of sessions.values()) {
      for (const cachedPage of session.pages) {
        cachedPage.rows = cachedPage.rows.map((row) =>
          row.kind === 'playlist' && row.playlist.id === updated.id
            ? { kind: 'playlist', playlist: updated }
            : row,
        );
      }
    }
  }, [sessions]);

  const savePlaylistChanges = useCallback(async (changes: PlaylistDetailsChanges) => {
    if (location.kind !== 'playlist' || saving) return;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError(null);
    try {
      await playlists.updatePlaylistDetails(location.playlist.id, changes, controller.signal);
      if (controller.signal.aborted) return;
      const updated = { ...location.playlist, ...changes };
      updateCachedPlaylist(updated);
      setLocation({ kind: 'playlist', playlist: updated });
      setEditMode(null);
      draftRef.current = '';
      setDraft('');
      setConfirmation('✓ Playlist updated.');
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(`Unable to update playlist: ${formatError(caught)}`);
    } finally {
      if (request.current === controller) request.current = null;
      setSaving(false);
    }
  }, [location, playlists, saving, updateCachedPlaylist]);

  const openEditMenu = useCallback(async () => {
    if (location.kind !== 'playlist' || loading || playing || saving) return;
    setError(null);
    try {
      const user = await auth.getCurrentUser();
      if (location.playlist.ownerId !== user.id) {
        setError('You can edit only playlists you own.');
        return;
      }
      setEditMode('menu');
      setConfirmation(null);
    } catch (caught) {
      setError(`Unable to verify playlist ownership: ${formatError(caught)}`);
    }
  }, [auth, loading, location, playing, saving]);

  const moveSelectedTrack = useCallback(async (to: number) => {
    if (location.kind !== 'playlist' || saving) return;
    const row = page?.rows[selectedIndex];
    if (!row || row.kind !== 'track') return;
    const from = pageIndex * PLAYLIST_TRACK_PAGE_SIZE + selectedIndex + 1;
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError(null);
    try {
      const user = await auth.getCurrentUser();
      if (location.playlist.ownerId !== user.id) {
        setError('You can edit only playlists you own.');
        return;
      }
      await playlists.moveItem(location.playlist.id, from, to, controller.signal);
      if (controller.signal.aborted) return;
      sessions.delete(locationKey);
      setPage(null);
      setPageIndex(0);
      setEditMode(null);
      draftRef.current = '';
      setDraft('');
      setRetryVersion((current) => current + 1);
      setConfirmation(`✓ Moved ${formatTrack(row.track)} to position ${to}.`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(`Unable to move playlist item: ${formatError(caught)}`);
    } finally {
      if (request.current === controller) request.current = null;
      setSaving(false);
    }
  }, [auth, location, locationKey, page, pageIndex, playlists, saving, selectedIndex, sessions]);

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
      if (selected.track.albumUri) {
        await player.playTrack(selected.track.uri, controller.signal, selected.track.albumUri);
      } else {
        await player.playTrack(selected.track.uri, controller.signal);
      }
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
      if (editMode) {
        setEditMode(null);
        draftRef.current = '';
        setDraft('');
      } else {
        goBack();
      }
      return;
    }
    if (key.ctrl || key.meta) return;
    if (editMode === 'menu') {
      if (input === 'n') {
        const value = location.kind === 'playlist' ? location.playlist.name : '';
        draftRef.current = value;
        setDraft(value);
        setEditMode('name');
      } else if (input === 'd') {
        const value = location.kind === 'playlist' ? location.playlist.description : '';
        draftRef.current = value;
        setDraft(value);
        setEditMode('description');
      } else if (input === 'v' && location.kind === 'playlist') {
        setEditMode('visibility');
      } else if (input === 'm' && location.kind === 'playlist') {
        draftRef.current = '';
        setDraft('');
        setEditMode('move-target');
      }
      return;
    }
    if (editMode === 'visibility') {
      if (input === 'y' && location.kind === 'playlist') {
        void savePlaylistChanges({ isPublic: !(location.playlist.isPublic ?? false) });
      } else if (input === 'n') {
        setEditMode(null);
      }
      return;
    }
    if (editMode === 'move-target') {
      if (key.return) {
        const target = Number(draftRef.current);
        if (!/^\d+$/.test(draftRef.current) || !Number.isSafeInteger(target) || target < 1) {
          setError('Enter a positive playlist position.');
          return;
        }
        void moveSelectedTrack(target);
      } else if (key.backspace || key.delete) {
        draftRef.current = draftRef.current.slice(0, -1);
        setDraft(draftRef.current);
      } else if (/^\d$/.test(input)) {
        draftRef.current += input;
        setDraft(draftRef.current);
      }
      return;
    }
    if (editMode === 'name' || editMode === 'description') {
      if (key.return) {
        void savePlaylistChanges(editMode === 'name' ? { name: draftRef.current } : { description: draftRef.current });
      } else if (key.backspace || key.delete) {
        draftRef.current = draftRef.current.slice(0, -1);
        setDraft(draftRef.current);
      } else if (input && !key.return) {
        draftRef.current += input;
        setDraft(draftRef.current);
      }
      return;
    }
    if (loading || playing || saving) return;
    if (input === 'e' && location.kind === 'playlist') {
      void openEditMenu();
      return;
    }
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
      {saving ? <Text color="yellow">Updating playlist…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      {editMode === 'menu' ? (
        <Box flexDirection="column">
          <Text bold>Edit playlist</Text>
          <Text dimColor>[n] Name · [d] Description · [v] Visibility · [m] Move selected track · [Esc] Cancel</Text>
        </Box>
      ) : null}
      {editMode === 'name' ? (
        <Box flexDirection="column">
          <Text>New playlist name: {draft}</Text>
          <Text dimColor>Enter save · Esc cancel</Text>
        </Box>
      ) : null}
      {editMode === 'description' ? (
        <Box flexDirection="column">
          <Text>New playlist description: {draft}</Text>
          <Text dimColor>Enter save · Esc cancel</Text>
        </Box>
      ) : null}
      {editMode === 'visibility' && location.kind === 'playlist' ? (
        <Box flexDirection="column">
          <Text>Make this playlist {location.playlist.isPublic ? 'private' : 'public'}? [y/N]</Text>
        </Box>
      ) : null}
      {editMode === 'move-target' ? (
        <Box flexDirection="column">
          <Text>Move selected track to position: {draft}</Text>
          <Text dimColor>Enter move · Esc cancel</Text>
        </Box>
      ) : null}
      {!loading && !error ? (
        <Text dimColor>
          Page {pageIndex + 1} · {hasPrevious ? 'p previous' : 'p unavailable'} ·{' '}
          {hasNext ? 'n next' : 'n unavailable'}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>
          {editMode
            ? 'Type to edit · Enter save · Esc cancel'
            : <>Enter {location.kind === 'playlist' ? 'play' : location.category === 'playlists' ? 'open/play' : 'play'} · ↑/↓ select · n/p page{location.kind === 'category' ? ' · Tab/←/→ category' : ' · e edit, then m move track'} · Esc back</>}
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
