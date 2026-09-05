import { stdin, stdout } from 'node:process';

import type { PlayerService } from '../services/player.service.js';
import { AppError } from '../utils/errors.js';
import { formatPlayback } from './output.js';

export interface WatchPlaybackOptions {
  player: Pick<PlayerService, 'getCurrentPlayback'>;
  refreshIntervalMs: number;
}

export type PlaybackWatcher = (options: WatchPlaybackOptions) => Promise<void>;

export const watchPlayback: PlaybackWatcher = async ({ player, refreshIntervalMs }) => {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new AppError('Watch mode requires an interactive terminal.');
  }

  let stopped = false;
  let resolveStop: () => void = () => undefined;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const stop = (): void => {
    stopped = true;
    resolveStop();
  };

  process.once('SIGINT', stop);
  stdout.write('\u001B[?1049h\u001B[?25l');

  try {
    while (!stopped) {
      const playback = await player.getCurrentPlayback();
      const content = playback
        ? formatPlayback(playback)
        : 'Nothing is currently playing.';
      stdout.write(`\u001B[2J\u001B[H${content}\n\nPress Ctrl+C to exit`);
      if (!stopped) await waitForRefresh(refreshIntervalMs, stopPromise);
    }
  } finally {
    process.removeListener('SIGINT', stop);
    stdout.write('\u001B[?25h\u001B[?1049l');
  }
};

async function waitForRefresh(milliseconds: number, stopPromise: Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timerPromise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, milliseconds);
  });
  await Promise.race([timerPromise, stopPromise]);
  if (timer) clearTimeout(timer);
}
