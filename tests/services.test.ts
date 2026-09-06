import { describe, expect, it, vi } from 'vitest';

import { PlayerService } from '../src/services/player.service.js';
import { SearchService } from '../src/services/search.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';
import { NoActiveDeviceError } from '../src/utils/errors.js';
import { createProgressBar, formatDuration } from '../src/utils/time.js';

function createApi(): SpotifyApi {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

const track = {
  id: 'track-id',
  uri: 'spotify:track:track-id',
  name: 'Numb',
  duration_ms: 185_000,
  artists: [{ id: 'artist-id', name: 'Linkin Park' }],
  album: { name: 'Meteora', images: [] },
  external_urls: { spotify: 'https://open.spotify.com/track/track-id' },
};

describe('time formatting', () => {
  it('formats durations and clamps progress bars', () => {
    expect(formatDuration(134_000)).toBe('2:14');
    expect(formatDuration(-1)).toBe('0:00');
    expect(createProgressBar(50, 100, 4)).toBe('━━──');
    expect(createProgressBar(200, 100, 4)).toBe('━━━━');
  });
});

describe('PlayerService', () => {
  it('maps current playback into an application model', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      is_playing: true,
      progress_ms: 10_000,
      item: track,
      device: { id: 'device', name: 'Laptop', is_active: true },
    });

    await expect(new PlayerService(api).getCurrentPlayback()).resolves.toMatchObject({
      isPlaying: true,
      progressMs: 10_000,
      track: { name: 'Numb', artists: ['Linkin Park'], album: 'Meteora' },
    });
  });

  it('automatically retries playback on the only controllable device', async () => {
    const api = createApi();
    vi.mocked(api.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined);
    const service = new PlayerService(api, {
      getControllableDevices: async () => [
        {
          id: 'device-id',
          name: 'Laptop',
          type: 'Computer',
          isActive: false,
          isPrivateSession: false,
          isRestricted: false,
          volumePercent: 50,
          supportsVolume: true,
        },
      ],
    });

    await service.playTrack(track.uri);

    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player/play', {
      body: { uris: [track.uri] },
      query: { device_id: 'device-id' },
    });
  });

  it('seeks absolutely and relative to current progress', async () => {
    const api = createApi();
    const service = new PlayerService(api);
    await expect(service.seek(90_000)).resolves.toBe(90_000);
    expect(api.put).toHaveBeenCalledWith('/me/player/seek', {
      query: { position_ms: 90_000 },
    });

    vi.mocked(api.get).mockResolvedValue({
      is_playing: true,
      progress_ms: 30_000,
      item: track,
      device: {
        id: 'device',
        name: 'Laptop',
        is_active: true,
        volume_percent: 50,
        supports_volume: true,
      },
    });
    await expect(service.changePosition(-40_000)).resolves.toBe(0);
  });

  it('sets an absolute volume through the documented query parameter', async () => {
    const api = createApi();
    await expect(new PlayerService(api).setVolume(50)).resolves.toBe(50);
    expect(api.put).toHaveBeenCalledWith('/me/player/volume', {
      query: { volume_percent: 50 },
    });
  });

  it('adjusts and clamps the active device volume', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      is_playing: true,
      progress_ms: 10_000,
      item: track,
      device: {
        id: 'device',
        name: 'Laptop',
        is_active: true,
        volume_percent: 95,
        supports_volume: true,
      },
    });

    await expect(new PlayerService(api).changeVolume(10)).resolves.toBe(100);
    expect(api.put).toHaveBeenCalledWith('/me/player/volume', {
      query: { volume_percent: 100 },
    });
  });

  it('rejects relative volume changes on unsupported devices', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      is_playing: true,
      progress_ms: 10_000,
      item: track,
      device: {
        id: 'device',
        name: 'Speaker',
        is_active: true,
        volume_percent: null,
        supports_volume: false,
      },
    });

    await expect(new PlayerService(api).changeVolume(-10)).rejects.toThrow(
      'does not support volume control',
    );
  });

  it('sends the selected track URI to Spotify', async () => {
    const api = createApi();
    await new PlayerService(api).playTrack(track.uri);
    expect(api.put).toHaveBeenCalledWith('/me/player/play', {
      body: { uris: [track.uri] },
    });
  });

  it('plays contexts and configures shuffle and repeat with documented parameters', async () => {
    const api = createApi();
    const player = new PlayerService(api);
    await player.playContext('spotify:album:album-id');
    await player.setShuffle(true);
    await player.setRepeat('context');

    expect(api.put).toHaveBeenNthCalledWith(1, '/me/player/play', {
      body: { context_uri: 'spotify:album:album-id' },
    });
    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player/shuffle', {
      query: { state: true },
    });
    expect(api.put).toHaveBeenNthCalledWith(3, '/me/player/repeat', {
      query: { state: 'context' },
    });
  });

  it('returns no playback for episode or unknown playback items', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      is_playing: true,
      progress_ms: 0,
      item: { type: 'episode', uri: 'spotify:episode:id' },
      device: { id: 'device', name: 'Laptop', is_active: true },
    });

    await expect(new PlayerService(api).getCurrentPlayback()).resolves.toBeNull();
  });
});

describe('SearchService', () => {
  it('searches tracks and maps results', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ tracks: { items: [track] } });
    const results = await new SearchService(api).searchTracks('Numb', 5);
    expect(api.get).toHaveBeenCalledWith('/search', {
      query: { q: 'Numb', type: 'track', limit: 5 },
    });
    expect(results[0]?.uri).toBe(track.uri);
  });
});
