import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Playlist, Track } from '../services/models.js';
import type { OffsetToken } from '../services/pagination.js';
import type { PlaylistService } from '../services/playlist.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export interface TuiPlaylistPicker extends Pick<PlaylistService, 'listPlaylistsPage'> {
  addItems(playlistId: string, uris: string[], signal?: AbortSignal): Promise<void>;
}

interface CachedPlaylistPage {
  items: Playlist[];
  nextToken: OffsetToken | null;
}

export interface PlaylistPickerSessionCache {
  pages: CachedPlaylistPage[];
  index: number;
}

export interface PlaylistPickerScreenProps {
  playlists: TuiPlaylistPicker;
  track: Track;
  sessionCache?: PlaylistPickerSessionCache;
  availableRows?: number;
  onAdded(playlist: Playlist): void;
  onBack(): void;
  onExit?(): void;
}

const PLAYLIST_PAGE_SIZE = 20;

export function PlaylistPickerScreen({
  playlists,
  track,
  sessionCache,
  availableRows = 10,
  onAdded,
  onBack,
  onExit,
}: PlaylistPickerScreenProps) {
  const localSession = useRef<PlaylistPickerSessionCache>({ pages: [], index: 0 });
  const session = sessionCache ?? localSession.current;
  const [pageIndex, setPageIndex] = useState(session.index);
  const [page, setPage] = useState<CachedPlaylistPage | null>(session.pages[session.index] ?? null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(!page);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<{ kind: 'load' | 'add'; message: string } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

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

    void playlists.listPlaylistsPage(token ?? undefined, PLAYLIST_PAGE_SIZE, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted || !active || version !== requestVersion.current) return;
        const nextPage = { items: loaded.items, nextToken: loaded.nextToken };
        session.pages[pageIndex] = nextPage;
        session.index = pageIndex;
        setPage(nextPage);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || !active || version !== requestVersion.current) return;
        setError({ kind: 'load', message: `Unable to load playlists: ${formatError(caught)}` });
      })
      .finally(() => {
        if (active && version === requestVersion.current) {
          request.current = null;
          setLoading(false);
        }
      });

    return () => {
      active = false;
      requestVersion.current += 1;
      request.current?.abort();
      request.current = null;
    };
  }, [pageIndex, playlists, retryVersion, session]);

  const addToSelectedPlaylist = useCallback(async () => {
    const selected = page?.items[selectedIndex];
    if (!selected || adding) return;

    cancelRequest();
    const controller = new AbortController();
    const version = requestVersion.current;
    request.current = controller;
    setAdding(true);
    setError(null);
    try {
      await playlists.addItems(selected.id, [track.uri], controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const updated = { ...selected, totalTracks: selected.totalTracks + 1 };
      session.pages = session.pages.map((cached) => ({
        ...cached,
        items: cached.items.map((playlist) =>
          playlist.id === selected.id ? updated : playlist,
        ),
      }));
      onAdded(updated);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError({ kind: 'add', message: `Unable to add track: ${formatError(caught)}` });
    } finally {
      if (version === requestVersion.current) {
        request.current = null;
        setAdding(false);
      }
    }
  }, [adding, cancelRequest, onAdded, page, playlists, selectedIndex, session, track.uri]);

  const cancel = useCallback(() => {
    cancelRequest();
    setAdding(false);
    onBack();
  }, [cancelRequest, onBack]);

  useInput((input, key) => {
    if (key.ctrl && input === 'x') {
      cancelRequest();
      onExit?.();
      return;
    }
    if (key.escape) {
      cancel();
      return;
    }
    if (key.ctrl || key.meta || loading || adding) return;
    if (error?.kind === 'load' && (input === 'r' || key.return)) {
      setRetryVersion((current) => current + 1);
      return;
    }
    if (key.upArrow && page?.items.length) {
      setSelectedIndex((current) => (current - 1 + page.items.length) % page.items.length);
      return;
    }
    if (key.downArrow && page?.items.length) {
      setSelectedIndex((current) => (current + 1) % page.items.length);
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
    if (key.return) void addToSelectedPlaylist();
  });

  const visibleRows = createListWindow(
    page?.items ?? [],
    selectedIndex,
    Math.max(1, availableRows - 6),
  );
  const hasPrevious = pageIndex > 0;
  const hasNext = Boolean(page?.nextToken);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Add current track to playlist</Text>
      <Text dimColor wrap="truncate-end">
        {formatTrack(track)}
      </Text>

      <Box marginTop={1} flexDirection="column">
        {loading ? <Text color="yellow">Loading playlists…</Text> : null}
        {!loading && !error && page?.items.length === 0 ? (
          <Text dimColor>No playlists found.</Text>
        ) : null}
        {!loading && visibleRows.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleRows.hiddenAbove} more</Text>
        ) : null}
        {!loading
          ? visibleRows.items.map((playlist, visibleIndex) => {
              const index = visibleRows.startIndex + visibleIndex;
              return (
                <Text
                  key={`${playlist.id}:${index}`}
                  wrap="truncate-end"
                  {...(index === selectedIndex ? { color: 'green' as const } : {})}
                >
                  {index === selectedIndex ? '›' : ' '} {formatPlaylist(playlist)}
                </Text>
              );
            })
          : null}
        {!loading && visibleRows.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleRows.hiddenBelow} more</Text>
        ) : null}
      </Box>

      {error ? (
        <Box flexDirection="column">
          <Text color="red">{error.message}</Text>
          <Text dimColor>
            {error.kind === 'load' ? 'Press r or Enter to retry.' : 'Press Enter to retry or Esc to cancel.'}
          </Text>
        </Box>
      ) : null}
      {adding ? <Text color="yellow">Adding track…</Text> : null}
      {!loading && !error ? (
        <Text dimColor>
          Page {pageIndex + 1} · {hasPrevious ? 'p previous' : 'p unavailable'} ·{' '}
          {hasNext ? 'n next' : 'n unavailable'}
        </Text>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>Enter add · ↑/↓ select · n/p page · Esc cancel</Text>
      </Box>
    </Box>
  );
}

function formatPlaylist(playlist: Playlist): string {
  const count = `${playlist.totalTracks} ${playlist.totalTracks === 1 ? 'track' : 'tracks'}`;
  return `${sanitizeOneLineText(playlist.name)} — ${sanitizeOneLineText(playlist.ownerName)} · ${count}`;
}

function formatTrack(track: Track): string {
  return `${sanitizeOneLineText(track.name)} — ${track.artists.map(sanitizeOneLineText).join(', ')}`;
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Spotify request failed. Try again.';
}
