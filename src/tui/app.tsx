import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { CurrentPlayback } from '../services/models.js';
import type { PlayerService } from '../services/player.service.js';
import { DevelopmentQuotaExceededError } from '../utils/errors.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { formatDuration } from '../utils/time.js';
import { DevicesScreen, type TuiDevice } from './devices-screen.js';
import {
  LibraryScreen,
  type LibrarySessionCache,
  type TuiLikedLibrary,
  type TuiPlaylistLibrary,
  type TuiRecentLibrary,
} from './library-screen.js';
import { getNavigationScreen, type TuiScreen } from './navigation.js';
import { QueueScreen, type TuiQueue } from './queue-screen.js';
import { HelpScreen, NavigationBar } from './screens.js';
import {
  SearchScreen,
  type SearchSessionCache,
  type TuiSearch,
} from './search-screen.js';

export const TUI_PLAYBACK_REFRESH_MS = 10_000;

export type TuiPlayer = Pick<
  PlayerService,
  | 'getCurrentPlayback'
  | 'seek'
  | 'setVolume'
  | 'next'
  | 'pause'
  | 'playContext'
  | 'playTrack'
  | 'previous'
  | 'resume'
  | 'setRepeat'
  | 'setShuffle'
>;

export interface TuiAppProps {
  player: TuiPlayer;
  search: TuiSearch;
  queue: TuiQueue;
  device: TuiDevice;
  playlists: TuiPlaylistLibrary;
  library: TuiLikedLibrary;
  recent: TuiRecentLibrary;
  refreshIntervalMs?: number;
  terminalSize?: { columns: number; rows: number };
}

export type TuiServices = Omit<TuiAppProps, 'refreshIntervalMs' | 'terminalSize'>;

export function TuiApp({
  player,
  search,
  queue,
  device,
  playlists,
  library,
  recent,
  refreshIntervalMs = TUI_PLAYBACK_REFRESH_MS,
  terminalSize,
}: TuiAppProps) {
  const { exit } = useApp();
  const windowSize = useWindowSize();
  const { columns, rows } = terminalSize ?? windowSize;
  const [activeScreen, setActiveScreen] = useState<TuiScreen>('player');
  const [playback, setPlayback] = useState<CurrentPlayback | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoadedPlayback, setHasLoadedPlayback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());
  const actionInProgress = useRef(false);
  const refreshRequest = useRef<AbortController | null>(null);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const automaticPollingStopped = useRef(false);
  const searchCache = useRef<SearchSessionCache>(new Map());
  const libraryCache = useRef<LibrarySessionCache>(new Map());

  const cancelRefresh = useCallback(() => {
    const controller = refreshRequest.current;
    refreshRequest.current = null;
    refreshPromise.current = null;
    controller?.abort();
  }, []);

  const refresh = useCallback((manual = false): Promise<void> => {
    if (manual) automaticPollingStopped.current = false;
    if (refreshPromise.current) return refreshPromise.current;

    const controller = new AbortController();
    refreshRequest.current = controller;
    const task = (async () => {
      try {
        const current = await player.getCurrentPlayback(controller.signal);
        if (controller.signal.aborted || refreshRequest.current !== controller) return;
        setPlayback(current);
        setHasLoadedPlayback(true);
        setObservedAt(Date.now());
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted || refreshRequest.current !== controller) return;
        if (caught instanceof DevelopmentQuotaExceededError) automaticPollingStopped.current = true;
        setError(formatTuiError(caught));
      } finally {
        if (refreshRequest.current === controller) {
          refreshRequest.current = null;
          refreshPromise.current = null;
          setLoading(false);
        }
      }
    })();
    refreshPromise.current = task;
    return task;
  }, [player]);

  useEffect(() => {
    if (activeScreen !== 'player') return;

    let active = true;
    let playbackTimer: NodeJS.Timeout | undefined;
    const poll = async () => {
      await refresh();
      if (active && !automaticPollingStopped.current) {
        playbackTimer = setTimeout(() => void poll(), refreshIntervalMs);
      }
    };
    void poll();
    const clockTimer = setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      active = false;
      if (playbackTimer) clearTimeout(playbackTimer);
      clearInterval(clockTimer);
      cancelRefresh();
    };
  }, [activeScreen, cancelRefresh, refresh, refreshIntervalMs]);

  const runPlayerAction = useCallback(
    async (
      label: string,
      operation: () => Promise<unknown>,
      updatePlayback?: (current: CurrentPlayback, result: unknown) => CurrentPlayback,
      refreshAfter = false,
    ) => {
      if (actionInProgress.current) return;
      actionInProgress.current = true;
      setAction(label);
      setError(null);
      try {
        cancelRefresh();
        const result = await operation();
        if (updatePlayback) {
          setPlayback((current) => (current ? updatePlayback(current, result) : current));
          setObservedAt(Date.now());
        }
        if (refreshAfter) await refresh();
      } catch (caught) {
        setError(formatTuiError(caught));
      } finally {
        actionInProgress.current = false;
        setAction(null);
      }
    },
    [cancelRefresh, refresh],
  );

  useInput((input, key) => {
    if (input === 'x') {
      exit();
      return;
    }
    if (key.escape) {
      if (activeScreen === 'player') exit();
      else setActiveScreen('player');
      return;
    }
    if (key.ctrl && input === 'r' && activeScreen === 'player') {
      if (!actionInProgress.current) void refresh(true);
      return;
    }
    if (key.ctrl || key.meta) return;

    const destination = getNavigationScreen(input);
    if (destination) {
      setActiveScreen(destination);
      return;
    }
    if (activeScreen !== 'player') return;

    if (input === ' ') {
      const operation = playback?.isPlaying ? () => player.pause() : () => player.resume();
      void runPlayerAction(
        playback?.isPlaying ? 'Pausing…' : 'Resuming…',
        operation,
        (current) => ({ ...current, isPlaying: !current.isPlaying }),
      );
      return;
    }
    if (input === 'n') void runPlayerAction('Skipping…', () => player.next(), undefined, true);
    if (input === 'p') void runPlayerAction('Going back…', () => player.previous(), undefined, true);
    if (key.leftArrow) {
      const target = Math.max(0, progressMs - 10_000);
      void runPlayerAction(
        'Seeking backward…',
        () => player.seek(target),
        (current, result) => ({
          ...current,
          progressMs: typeof result === 'number' ? result : target,
        }),
      );
    }
    if (key.rightArrow) {
      const target = Math.min(playback?.track.durationMs ?? 0, progressMs + 10_000);
      void runPlayerAction(
        'Seeking forward…',
        () => player.seek(target),
        (current, result) => ({
          ...current,
          progressMs: typeof result === 'number' ? result : target,
        }),
      );
    }
    if (input === '-') {
      const target = Math.max(0, (playback?.volumePercent ?? 0) - 5);
      void runPlayerAction(
        'Lowering volume…',
        () =>
          playback?.volumePercent === undefined
            ? Promise.reject(new Error('The active Spotify device does not support volume control.'))
            : player.setVolume(target),
        (current, result) => ({
          ...current,
          volumePercent: typeof result === 'number' ? result : target,
        }),
      );
    }
    if (input === '+') {
      const target = Math.min(100, (playback?.volumePercent ?? 0) + 5);
      void runPlayerAction(
        'Raising volume…',
        () =>
          playback?.volumePercent === undefined
            ? Promise.reject(new Error('The active Spotify device does not support volume control.'))
            : player.setVolume(target),
        (current, result) => ({
          ...current,
          volumePercent: typeof result === 'number' ? result : target,
        }),
      );
    }
    if (input === 's') {
      const enabled = !(playback?.shuffleState ?? false);
      void runPlayerAction(`${enabled ? 'Enabling' : 'Disabling'} shuffle…`, () =>
        player.setShuffle(enabled),
        (current) => ({ ...current, shuffleState: enabled }),
      );
    }
    if (input === 'r') {
      const mode = nextRepeatMode(playback?.repeatMode ?? 'off');
      void runPlayerAction(
        `Setting repeat to ${mode}…`,
        () => player.setRepeat(mode),
        (current) => ({ ...current, repeatMode: mode }),
      );
    }
  }, { isActive: activeScreen === 'player' || activeScreen === 'help' });

  const progressMs = getDisplayedProgress(playback, observedAt, clock);

  if (columns < 32 || rows < 10) {
    return (
      <Box width={columns} height={rows} paddingX={1} alignItems="center">
        <Text wrap="truncate-end">Terminal too small — resize to at least 32×10. Press x to exit.</Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      width={columns}
      height={rows}
      overflow="hidden"
    >
      <Text bold color="green">
        spoti
      </Text>
      <Box marginTop={1}>
        <NavigationBar activeScreen={activeScreen} compact={columns < 78} />
      </Box>
      <Box marginTop={1} flexDirection="column" flexGrow={1} minHeight={0} overflow="hidden">
        {activeScreen === 'player' ? (
          <>
            {loading ? (
              <Text>Loading current playback…</Text>
            ) : error && !hasLoadedPlayback ? (
              <Text dimColor>Playback state unavailable. Press Ctrl+R to retry.</Text>
            ) : playback ? (
              <PlaybackView
                playback={playback}
                progressMs={progressMs}
                contentWidth={columns - 4}
                compact={rows < 16}
              />
            ) : (
              <Text dimColor>Nothing is currently playing.</Text>
            )}
            {action ? (
              <Box marginTop={1}>
                <Text color="yellow">{action}</Text>
              </Box>
            ) : null}
            {error ? (
              <Box marginTop={1}>
                <Text color="red">{error}</Text>
              </Box>
            ) : null}
          </>
        ) : activeScreen === 'help' ? (
          <HelpScreen availableRows={Math.max(1, rows - 8)} />
        ) : activeScreen === 'search' ? (
          <SearchScreen
            search={search}
            player={player}
            sessionCache={searchCache.current}
            availableRows={Math.max(1, rows - 8)}
            onBack={() => setActiveScreen('player')}
            onExit={exit}
          />
        ) : activeScreen === 'queue' ? (
          <QueueScreen
            queue={queue}
            search={search}
            availableRows={Math.max(1, rows - 8)}
            onBack={() => setActiveScreen('player')}
            onExit={exit}
          />
        ) : activeScreen === 'devices' ? (
          <DevicesScreen
            device={device}
            availableRows={Math.max(1, rows - 8)}
            onBack={() => setActiveScreen('player')}
            onExit={exit}
          />
        ) : (
          <LibraryScreen
            playlists={playlists}
            library={library}
            recent={recent}
            player={player}
            sessionCache={libraryCache.current}
            availableRows={Math.max(1, rows - 8)}
            onBack={() => setActiveScreen('player')}
            onExit={exit}
          />
        )}
      </Box>
      <Box marginTop={1} flexWrap="wrap">
        <Text dimColor>
          {activeScreen === 'player'
            ? rows < 16
              ? '[space] Toggle  [?] Help  [x] Exit'
              : '[space] Play/Pause  [n/p] Track  [←/→] Seek  [-/+] Volume  [s] Shuffle  [r] Repeat  [Ctrl+R] Refresh  [?] Help  [x/Esc] Exit'
            : activeScreen === 'help'
              ? '[Esc] Back to Player  [x] Exit'
              : '[Esc] Back  [Ctrl+X] Exit'}
        </Text>
      </Box>
    </Box>
  );
}

function PlaybackView({
  playback,
  progressMs,
  contentWidth,
  compact,
}: {
  playback: CurrentPlayback;
  progressMs: number;
  contentWidth: number;
  compact: boolean;
}) {
  const status = playback.isPlaying ? '▶' : '⏸';
  const artists = playback.track.artists.map(sanitizeOneLineText).join(', ');

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={playback.isPlaying ? 'green' : 'yellow'}>{status}</Text>{' '}
        <Text bold>{sanitizeOneLineText(playback.track.name)}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        {artists} · {sanitizeOneLineText(playback.track.album)}
      </Text>
      <Box marginTop={1}>
        <Text>
          {formatPlaybackProgress(progressMs, playback.track.durationMs, contentWidth)}
        </Text>
      </Box>
      {!compact ? (
        <Box marginTop={1} flexWrap="wrap" columnGap={2}>
          <Text>
            Volume: {playback.volumePercent === undefined ? 'Unavailable' : `${playback.volumePercent}%`}
          </Text>
          <Text>
            Shuffle: {playback.shuffleState === undefined ? 'Unknown' : playback.shuffleState ? 'On' : 'Off'}
          </Text>
          <Text>Repeat: {formatRepeatMode(playback.repeatMode)}</Text>
        </Box>
      ) : null}
      {!compact && playback.deviceName ? (
        <Text dimColor wrap="truncate-end">Device: {sanitizeOneLineText(playback.deviceName)}</Text>
      ) : null}
    </Box>
  );
}

function getDisplayedProgress(
  playback: CurrentPlayback | null,
  observedAt: number,
  clock: number,
): number {
  if (!playback) return 0;
  const elapsed = playback.isPlaying ? Math.max(0, clock - observedAt) : 0;
  return Math.min(playback.track.durationMs, playback.progressMs + elapsed);
}

function formatPlaybackProgress(progressMs: number, durationMs: number, contentWidth: number): string {
  const progress = formatDuration(progressMs);
  const duration = formatDuration(durationMs);
  const barWidth = Math.min(24, Math.max(0, contentWidth - progress.length - duration.length - 2));
  if (barWidth < 6) return `${progress} / ${duration}`;

  const ratio = durationMs > 0 ? Math.min(1, Math.max(0, progressMs / durationMs)) : 0;
  const completed = Math.round(ratio * barWidth);
  return `${progress} ${'━'.repeat(completed)}${'─'.repeat(barWidth - completed)} ${duration}`;
}

function nextRepeatMode(mode: CurrentPlayback['repeatMode']): 'off' | 'track' | 'context' {
  if (mode === 'off' || mode === undefined) return 'track';
  if (mode === 'track') return 'context';
  return 'off';
}

function formatRepeatMode(mode: CurrentPlayback['repeatMode']): string {
  if (mode === 'track') return 'Track';
  if (mode === 'context') return 'Context';
  if (mode === 'off') return 'Off';
  return 'Unknown';
}

function formatTuiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeOneLineText(message) || 'Unable to update Spotify playback.';
}
