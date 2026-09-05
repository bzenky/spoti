import { describe, expect, it, vi } from 'vitest';

import { createProgram } from '../src/app.js';
import type { AuthService } from '../src/services/auth.service.js';
import type { DeviceService } from '../src/services/device.service.js';
import type { PlayerService } from '../src/services/player.service.js';
import type { QueueService } from '../src/services/queue.service.js';
import type { SearchService } from '../src/services/search.service.js';
import type { Track } from '../src/services/models.js';
import { DEFAULT_CONFIG, type ConfigStore } from '../src/storage/config.js';
import type { PlaybackWatcher } from '../src/ui/watch.js';
import { VERSION } from '../src/version.js';

const track: Track = {
  id: '1',
  uri: 'spotify:track:1',
  name: 'Numb',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 185_000,
};

function dependencies() {
  const messages: string[] = [];
  return {
    messages,
    auth: {
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: vi.fn(),
      getCurrentUser: vi.fn(),
      getAccessToken: vi.fn(),
    } as unknown as AuthService,
    player: {
      playTrack: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      setVolume: vi.fn(),
      changeVolume: vi.fn(),
      seek: vi.fn(),
      changePosition: vi.fn(),
      getCurrentPlayback: vi.fn(),
    } as unknown as PlayerService,
    search: { searchTracks: vi.fn() } as unknown as SearchService,
    device: {
      getDevices: vi.fn(),
      findDevice: vi.fn(),
      transferPlayback: vi.fn(),
    } as unknown as DeviceService,
    queue: {
      getQueue: vi.fn(),
      addItem: vi.fn(),
    } as unknown as QueueService,
    config: {
      read: vi.fn().mockResolvedValue({ ...DEFAULT_CONFIG }),
      write: vi.fn(),
      set: vi.fn(),
      reset: vi.fn(),
    } as unknown as ConfigStore,
    output: { log: (message: string) => messages.push(message), error: vi.fn() },
    chooseTrack: vi.fn(),
    watchPlayback: vi.fn() as PlaybackWatcher,
  };
}

async function run(args: string[], deps: ReturnType<typeof dependencies>): Promise<void> {
  await createProgram(deps).exitOverride().parseAsync(['node', 'spoti', ...args]);
}

describe('CLI application', () => {
  it('uses the package version', () => {
    expect(createProgram(dependencies()).version()).toBe(VERSION);
  });

  it('reads and updates configuration values', async () => {
    const deps = dependencies();
    await run(['config'], deps);
    expect(deps.messages).toEqual([
      'watchAfterPlay: false\nrefreshIntervalMs: 1000',
    ]);

    await run(['config', 'set', 'watchAfterPlay', 'true'], deps);
    expect(deps.config.set).toHaveBeenCalledWith('watchAfterPlay', true);
  });

  it('watches after play when enabled in configuration', async () => {
    const deps = dependencies();
    vi.mocked(deps.config.read).mockResolvedValue({
      watchAfterPlay: true,
      refreshIntervalMs: 2_000,
    });
    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);

    await run(['play', 'Numb', '--first'], deps);

    expect(deps.watchPlayback).toHaveBeenCalledWith({
      player: deps.player,
      refreshIntervalMs: 2_000,
    });
  });

  it('allows --no-watch to override configuration', async () => {
    const deps = dependencies();
    vi.mocked(deps.config.read).mockResolvedValue({
      watchAfterPlay: true,
      refreshIntervalMs: 1_000,
    });
    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);

    await run(['play', 'Numb', '--first', '--no-watch'], deps);

    expect(deps.watchPlayback).not.toHaveBeenCalled();
  });

  it('uses the configured interval for now --watch', async () => {
    const deps = dependencies();
    vi.mocked(deps.config.read).mockResolvedValue({
      watchAfterPlay: false,
      refreshIntervalMs: 3_000,
    });

    await run(['now', '--watch'], deps);

    expect(deps.watchPlayback).toHaveBeenCalledWith({
      player: deps.player,
      refreshIntervalMs: 3_000,
    });
  });

  it('lists and selects playback devices', async () => {
    const deps = dependencies();
    const device = {
      id: 'device-id',
      name: 'Laptop',
      type: 'Computer',
      isActive: true,
      isPrivateSession: false,
      isRestricted: false,
      volumePercent: 50,
      supportsVolume: true,
    };
    vi.mocked(deps.device.getDevices).mockResolvedValue([device]);
    vi.mocked(deps.device.findDevice).mockResolvedValue(device);

    await run(['devices'], deps);
    expect(deps.messages).toContain('1. Laptop · Computer · active · 50%');

    await run(['device', 'Laptop'], deps);
    expect(deps.device.transferPlayback).toHaveBeenCalledWith('device-id');
  });

  it('seeks to absolute and relative positions', async () => {
    const deps = dependencies();
    vi.mocked(deps.player.seek).mockResolvedValue(90_000);
    vi.mocked(deps.player.changePosition).mockResolvedValue(80_000);

    await run(['seek', '1:30'], deps);
    expect(deps.player.seek).toHaveBeenCalledWith(90_000);

    await run(['seek', '-10'], deps);
    expect(deps.player.changePosition).toHaveBeenCalledWith(-10_000);
  });

  it('shows the queue and adds a searched track', async () => {
    const deps = dependencies();
    vi.mocked(deps.queue.getQueue).mockResolvedValue({
      currentlyPlaying: {
        name: 'Numb',
        subtitle: 'Linkin Park',
        type: 'track',
        uri: 'spotify:track:1',
        durationMs: 185_000,
      },
      queue: [],
    });

    await run(['queue'], deps);
    expect(deps.messages[0]).toContain('Now: Numb — Linkin Park · 3:05');

    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);
    await run(['queue', 'Numb', '--first'], deps);
    expect(deps.queue.addItem).toHaveBeenCalledWith(track.uri);
  });

  it('sets and adjusts playback volume', async () => {
    const deps = dependencies();
    vi.mocked(deps.player.setVolume).mockResolvedValue(50);
    vi.mocked(deps.player.changeVolume).mockResolvedValue(40);

    await run(['volume', '50'], deps);
    expect(deps.player.setVolume).toHaveBeenCalledWith(50);
    expect(deps.messages).toContain('🔊 Volume: 50%');

    await run(['volume', '-10'], deps);
    expect(deps.player.changeVolume).toHaveBeenCalledWith(-10);
    expect(deps.messages).toContain('🔊 Volume: 40%');
  });

  it('plays the interactively selected result', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);
    deps.chooseTrack.mockResolvedValue(track);

    await run(['play', 'Numb'], deps);

    expect(deps.player.playTrack).toHaveBeenCalledWith(track.uri);
    expect(deps.messages).toContain('▶ Playing Numb — Linkin Park');
  });

  it('resumes playback when play has no query', async () => {
    const deps = dependencies();
    await run(['play'], deps);
    expect(deps.player.resume).toHaveBeenCalledOnce();
  });

  it('rejects malformed search limits', async () => {
    const deps = dependencies();
    await expect(run(['search', 'Numb', '--limit', '5junk'], deps)).rejects.toThrow(
      'Search limit must be an integer between 1 and 10.',
    );
    expect(deps.search.searchTracks).not.toHaveBeenCalled();
  });

  it('reports an empty search without attempting playback', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchTracks).mockResolvedValue([]);
    await run(['play', 'missing'], deps);
    expect(deps.player.playTrack).not.toHaveBeenCalled();
    expect(deps.messages).toEqual(['No tracks found for "missing".']);
  });
});
