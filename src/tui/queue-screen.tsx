import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Track } from '../services/models.js';
import type { PlaybackQueue, QueueItem, QueueService } from '../services/queue.service.js';
import type { SearchService } from '../services/search.service.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { formatDuration } from '../utils/time.js';
import { isUnmodifiedKey, removeLastGrapheme } from './input.js';
import { createListWindow } from './viewport.js';

export type TuiQueue = Pick<QueueService, 'addItem' | 'getQueue'>;
export type TuiQueueSearch = Pick<SearchService, 'searchTracks'>;

export interface QueueScreenProps {
  queue: TuiQueue;
  search: TuiQueueSearch;
  availableRows?: number;
  onBack(): void;
  onExit(): void;
}

type ScreenMode = 'queue' | 'add';

const SEARCH_LIMIT = 10;

export function QueueScreen({
  queue,
  search,
  availableRows = 10,
  onBack,
  onExit,
}: QueueScreenProps) {
  const [mode, setMode] = useState<ScreenMode>('queue');
  const [playbackQueue, setPlaybackQueue] = useState<PlaybackQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const invalidatePendingWork = useCallback(() => {
    requestVersion.current += 1;
    searchRequest.current?.abort();
    searchRequest.current = null;
  }, []);

  const refreshQueue = useCallback(
    async (clearConfirmation = true) => {
      invalidatePendingWork();
      const controller = new AbortController();
      const version = requestVersion.current;
      searchRequest.current = controller;
      setLoading(true);
      setSearching(false);
      setAdding(false);
      setError(null);
      if (clearConfirmation) setConfirmation(null);

      try {
        const loaded = await queue.getQueue(controller.signal);
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setPlaybackQueue(loaded);
      } catch (caught) {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setError(formatQueueError(caught));
      } finally {
        if (version === requestVersion.current) {
          searchRequest.current = null;
          setLoading(false);
        }
      }
    },
    [invalidatePendingWork, queue],
  );

  useEffect(() => {
    void refreshQueue();
    return invalidatePendingWork;
  }, [invalidatePendingWork, refreshQueue]);

  const editQuery = useCallback(
    (nextQuery: string) => {
      invalidatePendingWork();
      setQuery(nextQuery);
      setResults(null);
      setSelectedIndex(0);
      setSearching(false);
      setError(null);
      setConfirmation(null);
    },
    [invalidatePendingWork],
  );

  const beginAddFlow = useCallback(() => {
    invalidatePendingWork();
    setMode('add');
    setQuery('');
    setResults(null);
    setSelectedIndex(0);
    setSearching(false);
    setAdding(false);
    setError(null);
    setConfirmation(null);
  }, [invalidatePendingWork]);

  const cancelAddFlow = useCallback(() => {
    invalidatePendingWork();
    setMode('queue');
    setQuery('');
    setResults(null);
    setSelectedIndex(0);
    setSearching(false);
    setAdding(false);
    setError(null);
  }, [invalidatePendingWork]);

  const runSearch = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || searching || adding) return;

    invalidatePendingWork();
    const controller = new AbortController();
    const version = requestVersion.current;
    searchRequest.current = controller;
    setSearching(true);
    setResults(null);
    setSelectedIndex(0);
    setError(null);
    setConfirmation(null);

    try {
      const loaded = await search.searchTracks(normalizedQuery, SEARCH_LIMIT, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setResults(loaded);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(formatQueueError(caught));
    } finally {
      if (version === requestVersion.current) {
        searchRequest.current = null;
        setSearching(false);
      }
    }
  }, [adding, invalidatePendingWork, query, search, searching]);

  const addSelected = useCallback(async () => {
    const selected = results?.[selectedIndex];
    if (!selected || adding || searching) return;

    invalidatePendingWork();
    const controller = new AbortController();
    const version = requestVersion.current;
    searchRequest.current = controller;
    setAdding(true);
    setError(null);
    setConfirmation(null);

    try {
      await queue.addItem(selected.uri, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setAdding(false);
      setMode('queue');
      setQuery('');
      setResults(null);
      setSelectedIndex(0);
      setPlaybackQueue((current) =>
        current
          ? {
              ...current,
              queue: [
                ...current.queue,
                {
                  name: selected.name,
                  uri: selected.uri,
                  type: 'track',
                  subtitle: selected.artists.join(', '),
                  durationMs: selected.durationMs,
                },
              ],
            }
          : current,
      );
      setConfirmation(`Added ${formatTrack(selected)} to the queue.`);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setError(formatQueueError(caught));
    } finally {
      if (version === requestVersion.current) {
        searchRequest.current = null;
        setAdding(false);
      }
    }
  }, [adding, invalidatePendingWork, queue, results, searching, selectedIndex]);

  const leaveScreen = useCallback(
    (exit: boolean) => {
      invalidatePendingWork();
      if (exit) onExit();
      else onBack();
    },
    [invalidatePendingWork, onBack, onExit],
  );

  useInput((input, key) => {
    if (key.ctrl && input === 'x') {
      leaveScreen(true);
      return;
    }

    if (key.escape) {
      if (mode === 'add') cancelAddFlow();
      else leaveScreen(false);
      return;
    }

    if (mode === 'queue') {
      if (key.ctrl && input === 'r') void refreshQueue();
      else if (!key.ctrl && !key.meta && input === 'r') void refreshQueue();
      else if (!key.ctrl && !key.meta && input === 'a') beginAddFlow();
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
      if (results?.length) void addSelected();
      else void runSearch();
      return;
    }
    if (key.backspace || key.delete) {
      editQuery(removeLastGrapheme(query));
      return;
    }
    if (isUnmodifiedKey(input, key) && !searching && !adding) editQuery(`${query}${input}`);
  });

  return mode === 'add' ? (
    <AddTrackView
      query={query}
      results={results}
      selectedIndex={selectedIndex}
      searching={searching}
      adding={adding}
      error={error}
      availableRows={availableRows}
    />
  ) : (
    <QueueView
      playbackQueue={playbackQueue}
      loading={loading}
      error={error}
      confirmation={confirmation}
      availableRows={availableRows}
    />
  );
}

function QueueView({
  playbackQueue,
  loading,
  error,
  confirmation,
  availableRows,
}: {
  playbackQueue: PlaybackQueue | null;
  loading: boolean;
  error: string | null;
  confirmation: string | null;
  availableRows: number;
}) {
  const empty =
    playbackQueue !== null &&
    playbackQueue.currentlyPlaying === null &&
    playbackQueue.queue.length === 0;
  const visibleQueue = createListWindow(playbackQueue?.queue ?? [], 0, availableRows);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Playback queue</Text>
      {loading && playbackQueue === null ? (
        <Box marginTop={1}>
          <Text color="yellow">Loading queue…</Text>
        </Box>
      ) : null}
      {empty ? (
        <Box marginTop={1}>
          <Text dimColor>The queue is empty.</Text>
        </Box>
      ) : null}
      {playbackQueue?.currentlyPlaying ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">Now playing</Text>
          <QueueItemLine item={playbackQueue.currentlyPlaying} marker="▶" />
        </Box>
      ) : null}
      {playbackQueue && !empty ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">Upcoming</Text>
          {playbackQueue.queue.length ? (
            <>
              {visibleQueue.items.map((item, index) => (
                <QueueItemLine
                  key={`${item.uri}:${index}`}
                  item={item}
                  marker={`${visibleQueue.startIndex + index + 1}.`}
                />
              ))}
              {visibleQueue.hiddenBelow > 0 ? (
                <Text dimColor>↓ {visibleQueue.hiddenBelow} more queued items</Text>
              ) : null}
            </>
          ) : (
            <Text dimColor>No upcoming tracks.</Text>
          )}
        </Box>
      ) : null}
      {loading && playbackQueue !== null ? <Text color="yellow">Refreshing queue…</Text> : null}
      {confirmation ? <Text color="green">{confirmation}</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>[a] Add track · [r/Ctrl+R] Refresh · [Esc] Back · [Ctrl+X] Exit</Text>
      </Box>
    </Box>
  );
}

function AddTrackView({
  query,
  results,
  selectedIndex,
  searching,
  adding,
  error,
  availableRows,
}: {
  query: string;
  results: Track[] | null;
  selectedIndex: number;
  searching: boolean;
  adding: boolean;
  error: string | null;
  availableRows: number;
}) {
  const visibleResults = createListWindow(results ?? [], selectedIndex, availableRows);

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Add track to queue</Text>
      <Box marginTop={1} overflow="hidden">
        <Text wrap="truncate-start">Search: {sanitizeOneLineText(query)}▌</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {searching ? <Text color="yellow">Searching tracks…</Text> : null}
        {!searching && results?.length === 0 ? <Text dimColor>No tracks found.</Text> : null}
        {!searching && visibleResults.hiddenAbove > 0 ? (
          <Text dimColor>↑ {visibleResults.hiddenAbove} more</Text>
        ) : null}
        {!searching
          ? visibleResults.items.map((track, visibleIndex) => {
              const index = visibleResults.startIndex + visibleIndex;
              return (
                <Text
                  key={`${track.uri}:${index}`}
                  wrap="truncate-end"
                  {...(index === selectedIndex ? { color: 'green' as const } : {})}
                >
                  {index === selectedIndex ? '›' : ' '} {formatTrack(track)}
                </Text>
              );
            })
          : null}
        {!searching && visibleResults.hiddenBelow > 0 ? (
          <Text dimColor>↓ {visibleResults.hiddenBelow} more</Text>
        ) : null}
      </Box>
      {adding ? <Text color="yellow">Adding track to queue…</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box marginTop={1}>
        <Text dimColor>Type a query · Enter search/add · ↑/↓ select · Esc cancel</Text>
      </Box>
    </Box>
  );
}

function QueueItemLine({ item, marker }: { item: QueueItem; marker: string }) {
  return (
    <Text wrap="truncate-end">
      {marker} {sanitizeOneLineText(item.name)} — {sanitizeOneLineText(item.subtitle)} ·{' '}
      {formatDuration(item.durationMs)}
    </Text>
  );
}

function formatTrack(track: Track): string {
  return `${sanitizeOneLineText(track.name)} — ${track.artists.map(sanitizeOneLineText).join(', ')}`;
}

function formatQueueError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Queue request failed. Try again.';
}
