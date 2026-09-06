import { describe, expect, it, vi } from 'vitest';

import { RecentService } from '../src/services/recent.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';

function createApi(): SpotifyApi {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

const track = {
  id: 'track-id',
  uri: 'spotify:track:track-id',
  name: 'Numb',
  duration_ms: 185_000,
  artists: [{ id: 'artist-id', name: 'Linkin Park' }],
  album: { name: 'Meteora', images: [] },
};

describe('RecentService', () => {
  it('returns mapped recent tracks and skips null or unknown items', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [
        {
          played_at: '2026-01-01T00:00:00Z',
          context: { uri: 'spotify:album:album-id' },
          track,
        },
        { played_at: '2026-01-01T00:01:00Z', context: null, track: null },
        {
          played_at: '2026-01-01T00:02:00Z',
          context: null,
          track: { type: 'episode' },
        },
      ],
    });

    await expect(new RecentService(api).getRecentlyPlayed(500)).resolves.toMatchObject([
      {
        playedAt: '2026-01-01T00:00:00Z',
        contextUri: 'spotify:album:album-id',
        track: { name: 'Numb' },
      },
    ]);
    expect(api.get).toHaveBeenCalledWith('/me/player/recently-played', {
      query: { limit: 50 },
    });
  });
});
