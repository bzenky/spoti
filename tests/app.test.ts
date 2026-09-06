import { describe, expect, it, vi } from 'vitest';

import { createProgram } from '../src/app.js';
import type { AuthService } from '../src/services/auth.service.js';
import type { CatalogService } from '../src/services/catalog.service.js';
import type { DeviceService } from '../src/services/device.service.js';
import type { LibraryService } from '../src/services/library.service.js';
import type { Album, Artist, Playlist, Track } from '../src/services/models.js';
import type { PlayerService } from '../src/services/player.service.js';
import type { PlaylistService } from '../src/services/playlist.service.js';
import type { QueueService } from '../src/services/queue.service.js';
import type { RecentService } from '../src/services/recent.service.js';
import type { SearchService } from '../src/services/search.service.js';
import type { UpdateService } from '../src/services/update.service.js';
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

const album: Album = {
  id: 'album-1',
  uri: 'spotify:album:album-1',
  name: 'Meteora',
  artists: ['Linkin Park'],
  totalTracks: 13,
};

const artist: Artist = {
  id: 'artist-1',
  uri: 'spotify:artist:artist-1',
  name: 'Linkin Park',
};

const playlist: Playlist = {
  id: 'playlist-1',
  uri: 'spotify:playlist:playlist-1',
  name: 'Workout',
  description: 'Training tracks',
  ownerName: 'Bruno',
  isPublic: false,
  totalTracks: 1,
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
    catalog: {
      getAlbum: vi.fn(),
      getArtist: vi.fn(),
      getArtistAlbums: vi.fn(),
    } as unknown as CatalogService,
    player: {
      playTrack: vi.fn(),
      playContext: vi.fn(),
      setShuffle: vi.fn(),
      setRepeat: vi.fn(),
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
    search: {
      searchTracks: vi.fn(),
      searchAlbums: vi.fn(),
      searchArtists: vi.fn(),
      searchPlaylists: vi.fn(),
    } as unknown as SearchService,
    playlist: {
      listPlaylists: vi.fn(),
      getPlaylist: vi.fn(),
    } as unknown as PlaylistService,
    library: {
      getLikedTracks: vi.fn(),
      likeCurrentTrack: vi.fn(),
      unlikeCurrentTrack: vi.fn(),
    } as unknown as LibraryService,
    recent: { getRecentlyPlayed: vi.fn() } as unknown as RecentService,
    update: {
      checkForeground: vi.fn(),
      installLatest: vi.fn(),
    } as unknown as UpdateService,
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
    chooseAlbum: vi.fn(),
    chooseArtist: vi.fn(),
    choosePlaylist: vi.fn(),
    chooseAlbumAction: vi.fn(),
    chooseArtistAction: vi.fn(),
    choosePlaylistAction: vi.fn(),
    requestSpotifyClientId: vi.fn(),
    confirmUpdate: vi.fn(),
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

  it('saves a provided or interactively entered Spotify client ID', async () => {
    const deps = dependencies();
    await run(['setup', 'provided123'], deps);
    expect(deps.config.set).toHaveBeenNthCalledWith(1, 'spotifyClientId', 'provided123');

    deps.requestSpotifyClientId.mockResolvedValue('prompted456');
    await run(['setup'], deps);
    expect(deps.config.set).toHaveBeenNthCalledWith(2, 'spotifyClientId', 'prompted456');
    expect(deps.messages).toContain('✓ Spotify client ID saved.\n\nNext: spoti login');
  });

  it('reads and updates configuration values', async () => {
    const deps = dependencies();
    await run(['config'], deps);
    expect(deps.messages).toEqual([
      'spotifyClientId: null\nwatchAfterPlay: false\nrefreshIntervalMs: 1000',
    ]);

    await run(['config', 'set', 'watchAfterPlay', 'true'], deps);
    expect(deps.config.set).toHaveBeenCalledWith('watchAfterPlay', true);
  });

  it('watches after play when enabled in configuration', async () => {
    const deps = dependencies();
    vi.mocked(deps.config.read).mockResolvedValue({
      spotifyClientId: null,
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
      spotifyClientId: null,
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
      spotifyClientId: null,
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
    await run(['device', '1'], deps);
    expect(deps.device.findDevice).toHaveBeenNthCalledWith(1, 'Laptop');
    expect(deps.device.findDevice).toHaveBeenNthCalledWith(2, '1');
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

  it('plays explicit album, artist, and playlist contexts', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchAlbums).mockResolvedValue([album]);
    vi.mocked(deps.search.searchArtists).mockResolvedValue([artist]);
    vi.mocked(deps.search.searchPlaylists).mockResolvedValue([playlist]);

    await run(['play', 'album', 'Meteora', '--first'], deps);
    await run(['play', 'artist', 'Linkin Park', '--first'], deps);
    await run(['play', 'playlist', 'Workout', '--first'], deps);

    expect(deps.player.playContext).toHaveBeenNthCalledWith(1, album.uri);
    expect(deps.player.playContext).toHaveBeenNthCalledWith(2, artist.uri);
    expect(deps.player.playContext).toHaveBeenNthCalledWith(3, playlist.uri);
  });

  it('supports explicit track playback and preserves quoted context-prefixed queries', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);

    await run(['play', 'track', 'Numb', '--first'], deps);
    await run(['play', 'album version', '--first'], deps);

    expect(deps.search.searchTracks).toHaveBeenNthCalledWith(1, 'Numb');
    expect(deps.search.searchTracks).toHaveBeenNthCalledWith(2, 'album version');
    expect(deps.player.playTrack).toHaveBeenCalledTimes(2);
  });

  it('shows album and artist details', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchAlbums).mockResolvedValue([album]);
    vi.mocked(deps.catalog.getAlbum).mockResolvedValue({ ...album, tracks: [track] });
    vi.mocked(deps.search.searchArtists).mockResolvedValue([artist]);
    vi.mocked(deps.catalog.getArtist).mockResolvedValue(artist);

    await run(['album', 'Meteora', '--first'], deps);
    await run(['artist', 'Linkin Park', '--first'], deps);

    expect(deps.catalog.getAlbum).toHaveBeenCalledWith(album.id);
    expect(deps.catalog.getArtist).toHaveBeenCalledWith(artist.id);
    expect(deps.messages.join('\n')).toContain('Meteora — Linkin Park');
    expect(deps.messages.join('\n')).toContain('Linkin Park');
  });

  it('offers album playback or individual track playback after inspection', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchAlbums).mockResolvedValue([album]);
    vi.mocked(deps.catalog.getAlbum).mockResolvedValue({ ...album, tracks: [track] });
    deps.chooseAlbumAction.mockResolvedValueOnce('play-album').mockResolvedValueOnce('play-track');
    deps.chooseTrack.mockResolvedValue(track);

    await run(['album', 'Meteora', '--first'], deps);
    await run(['album', 'Meteora', '--first'], deps);

    expect(deps.player.playContext).toHaveBeenCalledWith(album.uri);
    expect(deps.player.playTrack).toHaveBeenCalledWith(track.uri);
  });

  it('allows selecting an album after inspecting an artist', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchArtists).mockResolvedValue([artist]);
    vi.mocked(deps.catalog.getArtist).mockResolvedValue(artist);
    vi.mocked(deps.catalog.getArtistAlbums).mockResolvedValue([album]);
    vi.mocked(deps.catalog.getAlbum).mockResolvedValue({ ...album, tracks: [track] });
    deps.chooseArtistAction.mockResolvedValue('select-album');
    deps.chooseAlbum.mockResolvedValue(album);
    deps.chooseAlbumAction.mockResolvedValue('play-album');

    await run(['artist', 'Linkin Park', '--first'], deps);

    expect(deps.catalog.getArtistAlbums).toHaveBeenCalledWith(artist.id);
    expect(deps.player.playContext).toHaveBeenCalledWith(album.uri);
  });

  it('lists and displays the user playlists', async () => {
    const deps = dependencies();
    vi.mocked(deps.playlist.listPlaylists).mockResolvedValue([playlist]);
    deps.choosePlaylistAction.mockResolvedValue('play-playlist');
    await run(['playlists'], deps);
    await run(['playlist', 'work', '--first'], deps);
    await run(['playlist', '1'], deps);
    await run(['play', 'playlist', '1'], deps);

    expect(deps.playlist.getPlaylist).not.toHaveBeenCalled();
    expect(deps.playlist.listPlaylists).toHaveBeenCalledWith(50);
    expect(deps.player.playContext).toHaveBeenCalledWith(playlist.uri);
    expect(deps.messages.join('\n')).toContain('Workout — Bruno · 1 item');
  });

  it('rejects an out-of-range playlist number', async () => {
    const deps = dependencies();
    vi.mocked(deps.playlist.listPlaylists).mockResolvedValue([playlist]);

    await expect(run(['playlist', '2'], deps)).rejects.toThrow(
      'Playlist number 2 is out of range',
    );
  });

  it('controls shuffle and repeat modes', async () => {
    const deps = dependencies();

    await run(['shuffle', 'on'], deps);
    await run(['repeat', 'context'], deps);

    expect(deps.player.setShuffle).toHaveBeenCalledWith(true);
    expect(deps.player.setRepeat).toHaveBeenCalledWith('context');
  });

  it('lists, likes, and unlikes library tracks', async () => {
    const deps = dependencies();
    vi.mocked(deps.library.getLikedTracks).mockResolvedValue([
      { addedAt: '2026-09-05T00:00:00Z', track },
    ]);
    vi.mocked(deps.library.likeCurrentTrack).mockResolvedValue(track);
    vi.mocked(deps.library.unlikeCurrentTrack).mockResolvedValue(track);

    await run(['liked'], deps);
    await run(['like'], deps);
    await run(['unlike'], deps);

    expect(deps.messages.join('\n')).toContain('♥ Liked Numb — Linkin Park');
    expect(deps.messages.join('\n')).toContain('♡ Unliked Numb — Linkin Park');
  });

  it('lists recently played tracks', async () => {
    const deps = dependencies();
    vi.mocked(deps.recent.getRecentlyPlayed).mockResolvedValue([
      { playedAt: '2026-09-05T00:00:00Z', track },
    ]);

    await run(['recent', '--limit', '5'], deps);

    expect(deps.recent.getRecentlyPlayed).toHaveBeenCalledWith(5);
    expect(deps.messages[0]).toContain('played 2026-09-05T00:00:00Z');
  });

  it('checks for updates without installing', async () => {
    const deps = dependencies();
    vi.mocked(deps.update.checkForeground).mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      checkedAt: 1,
      source: 'registry',
    });

    await run(['update', '--check'], deps);

    expect(deps.update.installLatest).not.toHaveBeenCalled();
    expect(deps.messages).toContain('Update available: 0.2.0 → 0.3.0');
  });

  it('installs an update only after confirmation', async () => {
    const deps = dependencies();
    vi.mocked(deps.update.checkForeground).mockResolvedValue({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      checkedAt: 1,
      source: 'registry',
    });
    deps.confirmUpdate.mockResolvedValue(true);

    await run(['update'], deps);

    expect(deps.update.installLatest).toHaveBeenCalledWith(true, '0.3.0');
    expect(deps.messages).toContain('✓ Updated spoti to 0.3.0.');
  });
});
