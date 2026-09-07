
import { describe, expect, it, vi } from 'vitest';

import type { Album, Artist, Playlist, Track } from '../src/services/models.js';
import {
  runInteractiveSearch,
  type InteractiveSearchKey,
  type InteractiveSearchTerminal,
} from '../src/ui/interactive-search.js';

const trackOne: Track = {
  id: 'track-1',
  uri: 'spotify:track:1',
  name: 'First Song',
  artists: ['First Artist'],
  album: 'First Album',
  durationMs: 180_000,
};

const trackTwo: Track = {
  id: 'track-2',
  uri: 'spotify:track:2',
  name: 'Second Song',
  artists: ['Second Artist'],
  album: 'Second Album',
  durationMs: 210_000,
};

const album: Album = {
  id: 'album-1',
  uri: 'spotify:album:1',
  name: 'An Album',
  artists: ['Album Artist'],
  totalTracks: 9,
};

const artist: Artist = {
  id: 'artist-1',
  uri: 'spotify:artist:1',
  name: 'An Artist',
};

const playlist: Playlist = {
  id: 'playlist-1',
  uri: 'spotify:playlist:1',
  name: 'A Playlist',
  description: '',
  ownerName: 'Listener',
  isPublic: true,
  totalTracks: 12,
};

class FakeTerminal implements InteractiveSearchTerminal {
  readonly writes: string[] = [];
  setupCalls = 0;
  cleanupCalls = 0;

  constructor(
    readonly isTTY: boolean,
    private readonly keys: InteractiveSearchKey[],
  ) {}

  setup(): void {
    this.setupCalls += 1;
  }

  cleanup(): void {
    this.cleanupCalls += 1;
  }

  async readKey(signal?: AbortSignal): Promise<InteractiveSearchKey> {
    if (signal) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (key: InteractiveSearchKey) => {
          if (settled) return;
          settled = true;
          clearTimeout(delivery);
          resolve(key);
        };
        const delivery = setTimeout(() => {
          if (this.keys[0]?.type === 'escape') finish(this.keys.shift()!);
        }, 0);
        signal.addEventListener('abort', () => finish({ type: 'other' }), { once: true });
      });
    }
    const key = this.keys.shift();
    if (!key) throw new Error('Fake terminal ran out of keys');
    return key;
  }

  write(value: string): void {
    this.writes.push(value);
  }
}

function characterKeys(value: string): InteractiveSearchKey[] {
  return Array.from(value, (character) => ({ type: 'character', value: character }));
}

function createServices() {
  return {
    search: {
      searchTracks: vi.fn(
        async (...args: [string, number?, AbortSignal?]): Promise<Track[]> => {
          void args;
          return [trackOne, trackTwo];
        },
      ),
      searchAlbums: vi.fn(
        async (...args: [string, number?, AbortSignal?]): Promise<Album[]> => {
          void args;
          return [album];
        },
      ),
      searchArtists: vi.fn(
        async (...args: [string, number?, AbortSignal?]): Promise<Artist[]> => {
          void args;
          return [artist];
        },
      ),
      searchPlaylists: vi.fn(
        async (...args: [string, number?, AbortSignal?]): Promise<Playlist[]> => {
          void args;
          return [playlist];
        },
      ),
    },
    player: {
      playTrack: vi.fn(async (...args: [string, AbortSignal?]): Promise<void> => {
        void args;
      }),
      playContext: vi.fn(async (...args: [string, AbortSignal?]): Promise<void> => {
        void args;
      }),
    },
  };
}

describe('runInteractiveSearch', () => {
  it('does nothing when input or output is not an interactive TTY', async () => {
    const terminal = new FakeTerminal(false, []);
    const services = createServices();

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toEqual({
      status: 'not-interactive',
    });
    expect(terminal.setupCalls).toBe(0);
    expect(terminal.cleanupCalls).toBe(0);
    expect(services.search.searchTracks).not.toHaveBeenCalled();
  });

  it('prompts for a query, renders track models, and plays the arrow-selected track', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('song'),
      { type: 'enter' },
      { type: 'down' },
      { type: 'enter' },
    ]);
    const services = createServices();

    await expect(
      runInteractiveSearch({ ...services, terminal, limit: 7 }),
    ).resolves.toEqual({
      status: 'played',
      category: 'track',
      uri: trackTwo.uri,
      label: 'Second Song — Second Artist',
    });

    expect(services.search.searchTracks).toHaveBeenCalledWith(
      'song',
      7,
      expect.any(AbortSignal),
    );
    expect(services.player.playTrack).toHaveBeenCalledWith(
      trackTwo.uri,
      expect.any(AbortSignal),
    );
    expect(services.player.playContext).not.toHaveBeenCalled();
    expect(terminal.writes.join('')).toContain('Second Song — Second Artist · Second Album');
    expect(terminal.setupCalls).toBe(1);
    expect(terminal.cleanupCalls).toBe(1);
  });

  it('switches categories with Tab, searches through SearchService, and plays contexts', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('mix'),
      { type: 'enter' },
      { type: 'tab' },
      { type: 'tab' },
      { type: 'tab' },
      { type: 'enter' },
    ]);
    const services = createServices();

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toEqual({
      status: 'played',
      category: 'playlist',
      uri: playlist.uri,
      label: 'A Playlist',
    });

    expect(services.search.searchTracks).toHaveBeenCalledWith(
      'mix',
      undefined,
      expect.any(AbortSignal),
    );
    expect(services.search.searchAlbums).toHaveBeenCalledWith(
      'mix',
      undefined,
      expect.any(AbortSignal),
    );
    expect(services.search.searchArtists).toHaveBeenCalledWith(
      'mix',
      undefined,
      expect.any(AbortSignal),
    );
    expect(services.search.searchPlaylists).toHaveBeenCalledWith(
      'mix',
      undefined,
      expect.any(AbortSignal),
    );
    expect(services.player.playContext).toHaveBeenCalledWith(
      playlist.uri,
      expect.any(AbortSignal),
    );
    expect(terminal.writes.join('')).toContain('A Playlist — Listener · 12 items');
  });

  it('renders an empty result message and lets Escape exit', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('missing'),
      { type: 'enter' },
      { type: 'escape' },
    ]);
    const services = createServices();
    services.search.searchTracks.mockResolvedValue([]);

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(terminal.writes.join('')).toContain('No tracks found for "missing".');
    expect(services.player.playTrack).not.toHaveBeenCalled();
    expect(terminal.cleanupCalls).toBe(1);
  });

  it('shows search failures inline and allows retrying without restarting', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('broken'),
      { type: 'enter' },
      { type: 'enter' },
      { type: 'enter' },
    ]);
    const services = createServices();
    services.search.searchTracks
      .mockRejectedValueOnce(new Error('search unavailable'))
      .mockResolvedValueOnce([trackOne]);

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toMatchObject({
      status: 'played',
      uri: trackOne.uri,
    });
    expect(services.search.searchTracks).toHaveBeenCalledTimes(2);
    expect(terminal.writes.join('')).toContain('Error: search unavailable');
    expect(terminal.cleanupCalls).toBe(1);
  });

  it('lets users edit a completed query and handles Unicode backspace safely', async () => {
    const terminal = new FakeTerminal(true, [
      { type: 'character', value: '🎵' },
      { type: 'backspace' },
      ...characterKeys('song'),
      { type: 'enter' },
      { type: 'character', value: 's' },
      { type: 'enter' },
      { type: 'enter' },
    ]);
    const services = createServices();

    await runInteractiveSearch({ ...services, terminal });

    expect(services.search.searchTracks).toHaveBeenNthCalledWith(
      1,
      'song',
      undefined,
      expect.any(AbortSignal),
    );
    expect(services.search.searchTracks).toHaveBeenNthCalledWith(
      2,
      'songs',
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('reuses cached category results during one query', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('mix'),
      { type: 'enter' },
      { type: 'tab' },
      { type: 'left' },
      { type: 'enter' },
    ]);
    const services = createServices();

    await runInteractiveSearch({ ...services, terminal });

    expect(services.search.searchTracks).toHaveBeenCalledOnce();
    expect(services.search.searchAlbums).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight search immediately with Escape', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('slow'),
      { type: 'enter' },
      { type: 'escape' },
    ]);
    const services = createServices();
    let requestSignal: AbortSignal | undefined;
    services.search.searchTracks.mockImplementation(
      async (_query, _limit, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise<Track[]>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    );

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(services.player.playTrack).not.toHaveBeenCalled();
    expect(terminal.cleanupCalls).toBe(1);
  });

  it('cancels in-flight playback immediately with Escape', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('song'),
      { type: 'enter' },
      { type: 'enter' },
      { type: 'escape' },
    ]);
    const services = createServices();
    let requestSignal: AbortSignal | undefined;
    services.player.playTrack.mockImplementation(async (_uri, signal?: AbortSignal) => {
      requestSignal = signal;
      return new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(terminal.cleanupCalls).toBe(1);
  });

  it('keeps the selected result available when playback fails temporarily', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('song'),
      { type: 'enter' },
      { type: 'enter' },
      { type: 'enter' },
    ]);
    const services = createServices();
    services.player.playTrack
      .mockRejectedValueOnce(new Error('device disconnected'))
      .mockResolvedValueOnce(undefined);

    await expect(runInteractiveSearch({ ...services, terminal })).resolves.toMatchObject({
      status: 'played',
      uri: trackOne.uri,
    });
    expect(services.player.playTrack).toHaveBeenCalledTimes(2);
    expect(terminal.writes.join('')).toContain('Error: device disconnected');
  });
});
