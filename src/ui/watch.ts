import { stdin, stdout } from 'node:process';

import type { PlayerService } from '../services/player.service.js';
import { AppError } from '../utils/errors.js';
import { createOutputStyles, formatPlayback } from './output.js';

export interface WatchRuntime {
  input: { isTTY?: boolean };
  output: { isTTY?: boolean; write(content: string): unknown };
  environment: NodeJS.ProcessEnv;
  once(signal: NodeJS.Signals, listener: () => void): void;
  removeListener(signal: NodeJS.Signals, listener: () => void): void;
}

export interface WatchPlaybackOptions {
  player: Pick<PlayerService, 'getCurrentPlayback'>;
  refreshIntervalMs: number;
  runtime?: WatchRuntime;
}

export type PlaybackWatcher = (options: WatchPlaybackOptions) => Promise<void>;

export const watchPlayback: PlaybackWatcher = async ({ player, refreshIntervalMs, runtime }) => {
  const activeRuntime = runtime ?? createProcessRuntime();
  if (!activeRuntime.input.isTTY || !activeRuntime.output.isTTY) {
    throw new AppError('Watch mode requires an interactive terminal.');
  }

  const styles = createOutputStyles(true, activeRuntime.environment);
  let stopped = false;
  let resolveStop: () => void = () => undefined;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  let activeRequest: AbortController | null = null;
  const stop = (): void => {
    stopped = true;
    activeRequest?.abort();
    resolveStop();
  };
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'];
  for (const signal of signals) activeRuntime.once(signal, stop);
  activeRuntime.output.write('\u001B[?1049h\u001B[?25l');

  try {
    while (!stopped) {
      activeRequest = new AbortController();
      try {
        const playback = await player.getCurrentPlayback(activeRequest.signal);
        if (stopped) break;
        const content = playback
          ? formatPlayback(playback, styles)
          : 'Nothing is currently playing.';
        activeRuntime.output.write(`\u001B[2J\u001B[H${content}\n\nPress Ctrl+C to exit`);
      } catch (error) {
        if (!stopped) throw error;
      } finally {
        activeRequest = null;
      }
      if (!stopped) await waitForRefresh(refreshIntervalMs, stopPromise);
    }
  } finally {
    activeRequest?.abort();
    for (const signal of signals) activeRuntime.removeListener(signal, stop);
    activeRuntime.output.write('\u001B[?25h\u001B[?1049l');
  }
};

function createProcessRuntime(): WatchRuntime {
  return {
    input: stdin,
    output: stdout,
    environment: process.env,
    once: (signal, listener) => process.once(signal, listener),
    removeListener: (signal, listener) => process.removeListener(signal, listener),
  };
}

async function waitForRefresh(milliseconds: number, stopPromise: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timerPromise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, milliseconds);
  });
  await Promise.race([timerPromise, stopPromise]);
  if (timer) clearTimeout(timer);
}
