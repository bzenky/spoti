import type { CurrentPlayback, Track } from '../services/models.js';
import { createProgressBar, formatDuration } from '../utils/time.js';

export interface Output {
  log(message: string): void;
  error(message: string): void;
}

export const consoleOutput: Output = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

export function formatPlayback(playback: CurrentPlayback): string {
  const indicator = playback.isPlaying ? '▶' : '⏸';
  const artists = playback.track.artists.join(', ');
  const progress = Math.min(playback.progressMs, playback.track.durationMs);
  return [
    `${indicator} ${playback.track.name}`,
    `${artists} · ${playback.track.album}`,
    '',
    `${formatDuration(progress)} ${createProgressBar(progress, playback.track.durationMs)} ${formatDuration(playback.track.durationMs)}`,
  ].join('\n');
}

export function formatTrack(track: Track, index?: number): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  return `${prefix}${track.name} — ${track.artists.join(', ')} · ${track.album}`;
}
