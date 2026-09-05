import { Command } from 'commander';

import type { AuthService } from './services/auth.service.js';
import type { DeviceService } from './services/device.service.js';
import type { PlayerService } from './services/player.service.js';
import type { QueueService } from './services/queue.service.js';
import type { SearchService } from './services/search.service.js';
import {
  CONFIG_KEYS,
  parseConfigValue,
  type ConfigKey,
  type ConfigStore,
} from './storage/config.js';
import { formatPlayback, formatTrack, type Output } from './ui/output.js';
import { selectTrack } from './ui/prompts.js';
import { watchPlayback, type PlaybackWatcher } from './ui/watch.js';
import { ConfigurationError } from './utils/errors.js';
import { formatDuration } from './utils/time.js';
import { VERSION } from './version.js';

export interface AppDependencies {
  auth: AuthService;
  player: PlayerService;
  search: SearchService;
  device: DeviceService;
  queue: QueueService;
  config: ConfigStore;
  output: Output;
  chooseTrack?: typeof selectTrack;
  watchPlayback?: PlaybackWatcher;
}

export function createProgram(dependencies: AppDependencies): Command {
  const program = new Command();
  const chooseTrack = dependencies.chooseTrack ?? selectTrack;
  const startWatching = dependencies.watchPlayback ?? watchPlayback;

  program
    .name('spoti')
    .description('Control Spotify from your terminal')
    .version(VERSION);

  program
    .command('login')
    .description('Log in to Spotify')
    .action(async () => {
      dependencies.output.log('Opening Spotify authorization in your browser…');
      const user = await dependencies.auth.login();
      dependencies.output.log(`✓ Logged in as ${user.displayName}`);
    });

  program
    .command('logout')
    .description('Remove locally stored Spotify credentials')
    .action(async () => {
      await dependencies.auth.logout();
      dependencies.output.log('✓ Logged out');
    });

  program
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      if (!(await dependencies.auth.isAuthenticated())) {
        dependencies.output.log('Not logged in.\n\nRun: spoti login');
        return;
      }
      const user = await dependencies.auth.getCurrentUser();
      dependencies.output.log(`✓ Logged in as ${user.displayName}`);
    });

  const configCommand = program
    .command('config')
    .description('View and update spoti configuration')
    .action(async () => {
      dependencies.output.log(formatConfig(await dependencies.config.read()));
    });

  configCommand
    .command('get')
    .description('Read a configuration value')
    .argument('<key>', 'configuration key')
    .action(async (keyName: string) => {
      const key = parseConfigKey(keyName);
      const config = await dependencies.config.read();
      dependencies.output.log(String(config[key]));
    });

  configCommand
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'configuration key')
    .argument('<value>', 'new value')
    .action(async (keyName: string, rawValue: string) => {
      const key = parseConfigKey(keyName);
      const value = parseConfigValue(key, rawValue);
      await dependencies.config.set(key, value);
      dependencies.output.log(`✓ ${key} = ${String(value)}`);
    });

  configCommand
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      await dependencies.config.reset();
      dependencies.output.log('✓ Configuration reset');
    });

  program
    .command('now')
    .description('Show the current Spotify playback')
    .option('-w, --watch', 'continuously refresh playback information')
    .action(async (options: { watch?: boolean }) => {
      if (options.watch) {
        const config = await dependencies.config.read();
        await startWatching({
          player: dependencies.player,
          refreshIntervalMs: config.refreshIntervalMs,
        });
        return;
      }
      const playback = await dependencies.player.getCurrentPlayback();
      dependencies.output.log(
        playback ? formatPlayback(playback) : 'Nothing is currently playing.',
      );
    });

  program
    .command('pause')
    .description('Pause playback')
    .action(async () => {
      await dependencies.player.pause();
      dependencies.output.log('⏸ Paused');
    });

  program
    .command('resume')
    .description('Resume playback')
    .action(async () => {
      await dependencies.player.resume();
      dependencies.output.log('▶ Resumed');
    });

  program
    .command('next')
    .alias('n')
    .description('Skip to the next track')
    .action(async () => {
      await dependencies.player.next();
      dependencies.output.log('⏭ Skipped to next track');
    });

  program
    .command('previous')
    .alias('prev')
    .description('Return to the previous track')
    .action(async () => {
      await dependencies.player.previous();
      dependencies.output.log('⏮ Returned to previous track');
    });

  program
    .command('devices')
    .description('List available Spotify Connect devices')
    .action(async () => {
      const devices = await dependencies.device.getDevices();
      if (devices.length === 0) {
        dependencies.output.log(
          'No Spotify devices are available. Open Spotify on a device and try again.',
        );
        return;
      }
      dependencies.output.log(
        devices
          .map((device, index) => {
            const state = device.isActive
              ? 'active'
              : device.isRestricted
                ? 'restricted'
                : 'available';
            const volume =
              device.volumePercent === null ? '' : ` · ${device.volumePercent}%`;
            return `${index + 1}. ${device.name} · ${device.type} · ${state}${volume}`;
          })
          .join('\n'),
      );
    });

  program
    .command('device')
    .description('Transfer playback to a Spotify Connect device')
    .argument('<name-or-id...>', 'exact device name or ID')
    .action(async (nameOrIdParts: string[]) => {
      const device = await dependencies.device.findDevice(nameOrIdParts.join(' '));
      if (!device.id) throw new ConfigurationError('The selected device has no usable ID.');
      await dependencies.device.transferPlayback(device.id);
      dependencies.output.log(`✓ Active device: ${device.name}`);
    });

  program
    .command('seek')
    .description('Seek within the current track')
    .argument('<position>', 'absolute time such as 1:30, or a change such as +30 or -10')
    .allowUnknownOption()
    .action(async (rawPosition: string) => {
      const input = parseSeekInput(rawPosition);
      const position = input.relative
        ? await dependencies.player.changePosition(input.milliseconds)
        : await dependencies.player.seek(input.milliseconds);
      dependencies.output.log(`⏩ Position: ${formatDuration(position)}`);
    });

  program
    .command('volume')
    .description('Set or adjust the active device volume')
    .argument('<value>', 'volume from 0-100, or a relative change such as +10 or -10')
    .allowUnknownOption()
    .action(async (rawValue: string) => {
      const input = parseVolumeInput(rawValue);
      const volume = input.relative
        ? await dependencies.player.changeVolume(input.value)
        : await dependencies.player.setVolume(input.value);
      dependencies.output.log(`${volume === 0 ? '🔇' : '🔊'} Volume: ${volume}%`);
    });

  program
    .command('queue')
    .description('Show the playback queue or add a searched track')
    .argument('[query...]', 'track name to add')
    .option('--first', 'queue the first search result without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        const playbackQueue = await dependencies.queue.getQueue();
        const lines = playbackQueue.currentlyPlaying
          ? [
              `Now: ${formatQueueItem(playbackQueue.currentlyPlaying)}`,
              '',
              'Up next:',
            ]
          : ['Up next:'];
        if (playbackQueue.queue.length === 0) lines.push('Queue is empty.');
        else {
          lines.push(
            ...playbackQueue.queue.map(
              (item, index) => `${index + 1}. ${formatQueueItem(item)}`,
            ),
          );
        }
        dependencies.output.log(lines.join('\n'));
        return;
      }

      const tracks = await dependencies.search.searchTracks(query);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${query}".`);
        return;
      }
      const track = options.first ? tracks[0] : await chooseTrack(tracks);
      if (!track) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      await dependencies.queue.addItem(track.uri);
      dependencies.output.log(`✓ Queued ${track.name} — ${track.artists.join(', ')}`);
    });

  program
    .command('search')
    .description('Search Spotify tracks')
    .argument('<query...>', 'track name to search for')
    .option('-l, --limit <number>', 'maximum number of results', parseLimit, 10)
    .action(async (queryParts: string[], options: { limit: number }) => {
      const query = queryParts.join(' ');
      const tracks = await dependencies.search.searchTracks(query, options.limit);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${query}".`);
        return;
      }
      dependencies.output.log(tracks.map((track, index) => formatTrack(track, index)).join('\n'));
    });

  program
    .command('play')
    .description('Search for and play a track, or resume with no query')
    .argument('[query...]', 'track name to search for')
    .option('--first', 'play the first search result without prompting')
    .option('--watch', 'continuously refresh playback information')
    .option('--no-watch', 'return to the shell after starting playback')
    .action(async (queryParts: string[], options: { first?: boolean; watch?: boolean }) => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        const config = await dependencies.config.read();
        const shouldWatch = options.watch ?? config.watchAfterPlay;
        await dependencies.player.resume();
        dependencies.output.log('▶ Resumed');
        if (shouldWatch) {
          await startWatching({
            player: dependencies.player,
            refreshIntervalMs: config.refreshIntervalMs,
          });
        }
        return;
      }

      const tracks = await dependencies.search.searchTracks(query);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${query}".`);
        return;
      }
      const track = options.first ? tracks[0] : await chooseTrack(tracks);
      if (!track) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      const config = await dependencies.config.read();
      const shouldWatch = options.watch ?? config.watchAfterPlay;
      await dependencies.player.playTrack(track.uri);
      dependencies.output.log(`▶ Playing ${track.name} — ${track.artists.join(', ')}`);
      if (shouldWatch) {
        await startWatching({
          player: dependencies.player,
          refreshIntervalMs: config.refreshIntervalMs,
        });
      }
    });

  return program;
}

interface SeekInput {
  relative: boolean;
  milliseconds: number;
}

function parseSeekInput(value: string): SeekInput {
  const relative = value.startsWith('+') || value.startsWith('-');
  const sign = value.startsWith('-') ? -1 : 1;
  const time = relative ? value.slice(1) : value;
  const parts = time.split(':');
  if (parts.length > 2 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new ConfigurationError(
      'Seek position must be seconds or minutes:seconds, such as 90, 1:30, +30, or -10.',
    );
  }

  const minutes = parts.length === 2 ? Number(parts[0]) : 0;
  const seconds = Number(parts.at(-1));
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds) || seconds >= 60 && parts.length === 2) {
    throw new ConfigurationError(
      'Seek position must be seconds or minutes:seconds, such as 90, 1:30, +30, or -10.',
    );
  }
  return {
    relative,
    milliseconds: sign * (minutes * 60 + seconds) * 1_000,
  };
}

function formatQueueItem(item: {
  name: string;
  subtitle: string;
  durationMs: number;
}): string {
  return `${item.name} — ${item.subtitle} · ${formatDuration(item.durationMs)}`;
}

interface VolumeInput {
  relative: boolean;
  value: number;
}

function parseVolumeInput(value: string): VolumeInput {
  if (/^[+-]\d+$/.test(value)) {
    const delta = Number(value);
    if (Number.isSafeInteger(delta) && Math.abs(delta) <= 100) {
      return { relative: true, value: delta };
    }
    throw new ConfigurationError('Relative volume must be between -100 and +100.');
  }
  if (/^\d+$/.test(value)) {
    const volume = Number(value);
    if (Number.isSafeInteger(volume) && volume <= 100) {
      return { relative: false, value: volume };
    }
  }
  throw new ConfigurationError('Volume must be from 0 to 100, or a change such as +10 or -10.');
}

function parseConfigKey(value: string): ConfigKey {
  if (CONFIG_KEYS.includes(value as ConfigKey)) return value as ConfigKey;
  throw new ConfigurationError(
    `Unknown configuration key "${value}". Valid keys: ${CONFIG_KEYS.join(', ')}.`,
  );
}

function formatConfig(config: Awaited<ReturnType<ConfigStore['read']>>): string {
  return CONFIG_KEYS.map((key) => `${key}: ${String(config[key])}`).join('\n');
}

function parseLimit(value: string): number {
  const limit = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Search limit must be an integer between 1 and 10.');
  }
  return limit;
}
