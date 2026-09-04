import { describe, expect, it, vi } from 'vitest';

import { PlayerService } from '../src/services/player.service.js';
import { SearchService } from '../src/services/search.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';
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

  it('sends the selected track URI to Spotify', async () => {
    const api = createApi();
    await new PlayerService(api).playTrack(track.uri);
    expect(api.put).toHaveBeenCalledWith('/me/player/play', {
      body: { uris: [track.uri] },
    });
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
