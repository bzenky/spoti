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

  async readKey(): Promise<InteractiveSearchKey> {
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
      searchTracks: vi.fn(async () => [trackOne, trackTwo]),
      searchAlbums: vi.fn(async () => [album]),
      searchArtists: vi.fn(async () => [artist]),
      searchPlaylists: vi.fn(async () => [playlist]),
    },
    player: {
      playTrack: vi.fn(async () => undefined),
      playContext: vi.fn(async () => undefined),
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
    });

    expect(services.search.searchTracks).toHaveBeenCalledWith('song', 7);
    expect(services.player.playTrack).toHaveBeenCalledWith(trackTwo.uri);
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
    });

    expect(services.search.searchTracks).toHaveBeenCalledWith('mix', undefined);
    expect(services.search.searchAlbums).toHaveBeenCalledWith('mix', undefined);
    expect(services.search.searchArtists).toHaveBeenCalledWith('mix', undefined);
    expect(services.search.searchPlaylists).toHaveBeenCalledWith('mix', undefined);
    expect(services.player.playContext).toHaveBeenCalledWith(playlist.uri);
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

  it('always restores the terminal when search fails', async () => {
    const terminal = new FakeTerminal(true, [
      ...characterKeys('broken'),
      { type: 'enter' },
    ]);
    const services = createServices();
    services.search.searchTracks.mockRejectedValue(new Error('search unavailable'));

    await expect(runInteractiveSearch({ ...services, terminal })).rejects.toThrow(
      'search unavailable',
    );
    expect(terminal.cleanupCalls).toBe(1);
  });
});
