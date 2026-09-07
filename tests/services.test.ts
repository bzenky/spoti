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

function device(id: string, isActive = false) {
  return {
    id,
    name: id,
    type: 'Computer',
    isActive,
    isPrivateSession: false,
    isRestricted: false,
    volumePercent: 50,
    supportsVolume: true,
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

  it('automatically retries track playback on the only controllable device', async () => {
    const api = createApi();
    vi.mocked(api.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined);
    const service = new PlayerService(api, {
      getControllableDevices: async () => [device('device-id')],
    });

    await service.playTrack(track.uri);

    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player/play', {
      body: { uris: [track.uri] },
      query: { device_id: 'device-id' },
    });
  });

  it('propagates cancellation through track and context playback fallbacks', async () => {
    const signal = new AbortController().signal;
    const directApi = createApi();
    await new PlayerService(directApi).playTrack(track.uri, signal);
    expect(directApi.put).toHaveBeenCalledWith('/me/player/play', {
      body: { uris: [track.uri] },
      signal,
    });

    const fallbackApi = createApi();
    vi.mocked(fallbackApi.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined);
    const service = new PlayerService(fallbackApi, {
      getControllableDevices: async () => [device('device-id')],
    });
    await service.playContext('spotify:album:album-id', signal);
    expect(fallbackApi.put).toHaveBeenNthCalledWith(2, '/me/player/play', {
      body: { context_uri: 'spotify:album:album-id' },
      query: { device_id: 'device-id' },
      signal,
    });
  });

  it('does not attempt device fallback after playback is aborted', async () => {
    const controller = new AbortController();
    const api = createApi();
    vi.mocked(api.put).mockImplementationOnce(async () => {
      controller.abort();
      throw new NoActiveDeviceError();
    });
    const getControllableDevices = vi.fn().mockResolvedValue([device('device-id')]);

    const request = new PlayerService(api, { getControllableDevices }).playTrack(
      track.uri,
      controller.signal,
    );

    await expect(request).rejects.toBe(controller.signal.reason);
    expect(getControllableDevices).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledOnce();
  });

  it('cancels pending fallback discovery and does not retry playback', async () => {
    const controller = new AbortController();
    const api = createApi();
    vi.mocked(api.put).mockRejectedValueOnce(new NoActiveDeviceError());
    const getControllableDevices = vi.fn((signal?: AbortSignal) => {
      expect(signal).toBe(controller.signal);
      return new Promise<ReturnType<typeof device>[]>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const service = new PlayerService(api, { getControllableDevices });

    const request = service.playTrack(track.uri, controller.signal);
    await vi.waitFor(() => expect(getControllableDevices).toHaveBeenCalledWith(controller.signal));
    controller.abort();

    await expect(request).rejects.toBe(controller.signal.reason);
    expect(api.put).toHaveBeenCalledOnce();
  });

  it('prefers exactly one active controllable device and preserves context bodies', async () => {
    const api = createApi();
    vi.mocked(api.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined);
    const service = new PlayerService(api, {
      getControllableDevices: async () => [
        device('inactive-device'),
        device('active-device', true),
      ],
    });

    await service.playContext('spotify:album:album-id');

    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player/play', {
      body: { context_uri: 'spotify:album:album-id' },
      query: { device_id: 'active-device' },
    });
  });

  it('retries resume without inventing a body and merges existing query parameters', async () => {
    const api = createApi();
    vi.mocked(api.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockResolvedValueOnce(undefined);
    const service = new PlayerService(api, {
      getControllableDevices: async () => [device('device-id')],
    });

    await service.resume();
    await service.setShuffle(true);

    expect(api.put).toHaveBeenNthCalledWith(2, '/me/player/play', {
      query: { device_id: 'device-id' },
    });
    expect(api.put).toHaveBeenNthCalledWith(4, '/me/player/shuffle', {
      query: { state: true, device_id: 'device-id' },
    });
  });

  it('keeps actionable errors when no unique fallback device exists', async () => {
    const noDevicesApi = createApi();
    vi.mocked(noDevicesApi.put).mockRejectedValue(new NoActiveDeviceError());
    const noDevices = new PlayerService(noDevicesApi, {
      getControllableDevices: async () => [],
    });
    await expect(noDevices.resume()).rejects.toThrow('Open Spotify on one of your devices');

    const multipleDevicesApi = createApi();
    vi.mocked(multipleDevicesApi.put).mockRejectedValue(new NoActiveDeviceError());
    const multipleDevices = new PlayerService(multipleDevicesApi, {
      getControllableDevices: async () => [device('one'), device('two')],
    });
    await expect(multipleDevices.playTrack(track.uri)).rejects.toThrow(
      'spoti device <number>',
    );
  });

  it('does not retry non-device failures and preserves a failed retry', async () => {
    const api = createApi();
    const nonDeviceError = new Error('network failed');
    vi.mocked(api.put).mockRejectedValueOnce(nonDeviceError);
    const getControllableDevices = vi.fn().mockResolvedValue([device('device-id')]);
    const service = new PlayerService(api, { getControllableDevices });

    await expect(service.playTrack(track.uri)).rejects.toBe(nonDeviceError);
    expect(getControllableDevices).not.toHaveBeenCalled();

    const retryError = new Error('retry failed');
    vi.mocked(api.put)
      .mockRejectedValueOnce(new NoActiveDeviceError())
      .mockRejectedValueOnce(retryError);
    await expect(service.resume()).rejects.toBe(retryError);
    expect(api.put).toHaveBeenCalledTimes(3);
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

  it('reads shuffle and repeat state from the current playback response', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ shuffle_state: true, repeat_state: 'context' });
    const player = new PlayerService(api);

    await expect(player.getShuffleState()).resolves.toBe(true);
    await expect(player.getRepeatState()).resolves.toBe('context');
    expect(api.get).toHaveBeenCalledWith('/me/player');
  });

  it('reports a missing playback state when reading shuffle', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(undefined);

    await expect(new PlayerService(api).getShuffleState()).rejects.toBeInstanceOf(
      NoActiveDeviceError,
    );
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
  it('passes cancellation signals through every search method', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({});
    const service = new SearchService(api);
    const signal = new AbortController().signal;

    await service.searchTracks('track query', 1, signal);
    await service.searchAlbums('album query', 2, signal);
    await service.searchArtists('artist query', 3, signal);
    await service.searchPlaylists('playlist query', 4, signal);

    expect(api.get).toHaveBeenNthCalledWith(1, '/search', {
      query: { q: 'track query', type: 'track', limit: 1 },
      signal,
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/search', {
      query: { q: 'album query', type: 'album', limit: 2 },
      signal,
    });
    expect(api.get).toHaveBeenNthCalledWith(3, '/search', {
      query: { q: 'artist query', type: 'artist', limit: 3 },
      signal,
    });
    expect(api.get).toHaveBeenNthCalledWith(4, '/search', {
      query: { q: 'playlist query', type: 'playlist', limit: 4 },
      signal,
    });
  });

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
