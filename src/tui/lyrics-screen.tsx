import { Box, Text, useInput } from 'ink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Lyrics, LyricsService } from '../services/lyrics.service.js';
import type { Track } from '../services/models.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { createListWindow } from './viewport.js';

export type TuiLyrics = Pick<LyricsService, 'getLyrics'>;

export interface LyricsScreenProps {
  lyrics: TuiLyrics;
  track: Track | null;
  progressMs: number;
  availableRows: number;
  onBack(): void;
  onExit(): void;
}

interface SyncedLine {
  text: string;
  timestampMs: number;
}

type LyricsState =
  | { status: 'idle' | 'loading' }
  | { status: 'loaded'; lyrics: Lyrics | null }
  | { status: 'error'; message: string };

const LRCLIB_ATTRIBUTION = 'Lyrics from LRCLIB: https://lrclib.net';
const TIMESTAMP = /^\[(\d{1,6}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

export function LyricsScreen({
  lyrics,
  track,
  progressMs,
  availableRows,
  onBack,
  onExit,
}: LyricsScreenProps) {
  const [state, setState] = useState<LyricsState>({ status: track ? 'loading' : 'idle' });
  const [scrollIndex, setScrollIndex] = useState(0);
  const [following, setFollowing] = useState(true);
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const cancelRequest = useCallback(() => {
    requestVersion.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);

  const loadLyrics = useCallback(async () => {
    if (!track) return;

    cancelRequest();
    const controller = new AbortController();
    const version = requestVersion.current;
    request.current = controller;
    setState({ status: 'loading' });
    setScrollIndex(0);
    setFollowing(true);

    try {
      const loaded = await lyrics.getLyrics(track, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setState({ status: 'loaded', lyrics: loaded });
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setState({ status: 'error', message: formatLyricsError(caught) });
    } finally {
      if (version === requestVersion.current) request.current = null;
    }
  }, [cancelRequest, lyrics, track]);

  useEffect(() => {
    if (track) void loadLyrics();
    else setState({ status: 'idle' });
    return cancelRequest;
  }, [cancelRequest, loadLyrics, track]);

  const syncedLines = useMemo(
    () => state.status === 'loaded' ? parseSyncedLyrics(state.lyrics?.syncedLyrics ?? null) : [],
    [state],
  );
  const plainLines = useMemo(
    () => state.status === 'loaded' ? parsePlainLyrics(state.lyrics?.plainLyrics ?? null) : [],
    [state],
  );
  const displayedLines = syncedLines.length > 0 ? syncedLines.map((line) => line.text) : plainLines;
  const currentLineIndex = syncedLines.length > 0 ? findCurrentLine(syncedLines, progressMs) : -1;
  const followedIndex = currentLineIndex >= 0 ? currentLineIndex : 0;
  const selectedIndex = following && syncedLines.length > 0 ? followedIndex : scrollIndex;
  const lyricRows = Math.max(1, availableRows - 7);
  const visibleLines = createListWindow(displayedLines, selectedIndex, lyricRows);

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
    if ((input === 'r' || key.return) && state.status === 'error') {
      void loadLyrics();
      return;
    }
    if (input === 'f' && syncedLines.length > 0) {
      setFollowing(true);
      setScrollIndex(followedIndex);
      return;
    }
    if (key.upArrow && displayedLines.length > 0) {
      setFollowing(false);
      setScrollIndex((current) => Math.max(0, (following ? selectedIndex : current) - 1));
      return;
    }
    if (key.downArrow && displayedLines.length > 0) {
      setFollowing(false);
      setScrollIndex((current) =>
        Math.min(displayedLines.length - 1, (following ? selectedIndex : current) + 1),
      );
    }
  });

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Lyrics</Text>
      {track ? (
        <Text dimColor wrap="truncate-end">
          {safeText(track.name, 'Unknown track')} — {safeArtists(track.artists)}
        </Text>
      ) : null}
      <Box marginTop={1} flexDirection="column" minHeight={0} overflow="hidden">
        {!track ? (
          <Text dimColor>
            Nothing is currently playing. Start playback in Spotify, then return to Player and refresh.
          </Text>
        ) : state.status === 'loading' ? (
          <Text color="yellow">Loading lyrics from LRCLIB…</Text>
        ) : state.status === 'error' ? (
          <Text color="red">{state.message} Press Enter or [r] to retry.</Text>
        ) : state.status === 'loaded' && state.lyrics === null ? (
          <Text dimColor>No lyrics found for this track.</Text>
        ) : state.status === 'loaded' && state.lyrics?.instrumental ? (
          <Text dimColor>This track is instrumental.</Text>
        ) : displayedLines.length > 0 ? (
          <>
            {visibleLines.hiddenAbove > 0 ? (
              <Text dimColor>↑ {visibleLines.hiddenAbove} more lines</Text>
            ) : null}
            {visibleLines.items.map((line, visibleIndex) => {
              const index = visibleLines.startIndex + visibleIndex;
              const current = syncedLines.length > 0 && index === currentLineIndex;
              return (
                <Text
                  key={`${index}:${line}`}
                  wrap="truncate-end"
                  {...(current ? { bold: true, color: 'green' as const } : {})}
                >
                  {current ? '▶ ' : '  '}{line || ' '}
                </Text>
              );
            })}
            {visibleLines.hiddenBelow > 0 ? (
              <Text dimColor>↓ {visibleLines.hiddenBelow} more lines</Text>
            ) : null}
          </>
        ) : (
          <Text dimColor>No lyrics found for this track.</Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{LRCLIB_ATTRIBUTION}</Text>
        <Text dimColor>
          [↑/↓] Scroll{syncedLines.length > 0 ? ` · [f] ${following ? 'Following' : 'Resume follow'}` : ''} · [Esc] Back · [Ctrl+X] Exit
        </Text>
      </Box>
    </Box>
  );
}

export function parseSyncedLyrics(value: string | null): SyncedLine[] {
  if (!value) return [];

  const parsed: Array<SyncedLine & { order: number }> = [];
  for (const [order, rawLine] of value.replace(/\r\n?/g, '\n').split('\n').entries()) {
    let remainder = rawLine;
    const timestamps: number[] = [];
    for (;;) {
      const match = TIMESTAMP.exec(remainder);
      if (!match) break;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? '';
      if (Number.isSafeInteger(minutes) && seconds >= 0 && seconds < 60) {
        const milliseconds = fraction ? Number(fraction.padEnd(3, '0')) : 0;
        const timestampMs = minutes * 60_000 + seconds * 1_000 + milliseconds;
        if (Number.isSafeInteger(timestampMs)) timestamps.push(timestampMs);
      }
      remainder = remainder.slice(match[0].length);
    }
    if (timestamps.length === 0) continue;
    const text = sanitizeOneLineText(remainder);
    for (const timestampMs of timestamps) parsed.push({ text, timestampMs, order });
  }

  return parsed
    .sort((left, right) => left.timestampMs - right.timestampMs || left.order - right.order)
    .map(({ text, timestampMs }) => ({ text, timestampMs }));
}

function parsePlainLyrics(value: string | null): string[] {
  if (!value) return [];
  return value.replace(/\r\n?/g, '\n').split('\n').map(sanitizeOneLineText);
}

function findCurrentLine(lines: readonly SyncedLine[], progressMs: number): number {
  if (lines.length === 0) return -1;
  let current = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.timestampMs > progressMs) break;
    current = index;
  }
  return current;
}

function safeArtists(artists: readonly string[]): string {
  const value = artists.map((artist) => sanitizeOneLineText(artist)).filter(Boolean).join(', ');
  return value || 'Unknown artist';
}

function safeText(value: string, fallback: string): string {
  return sanitizeOneLineText(value) || fallback;
}

function formatLyricsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Unable to load lyrics from LRCLIB.';
}
