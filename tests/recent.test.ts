import { describe, expect, it, vi } from 'vitest';

import type { RecentCursorToken } from '../src/services/pagination.js';
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
  it('keeps getRecentlyPlayed compatible by returning first-page items', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [
        {
          played_at: '2026-01-01T00:00:00Z',
          context: { uri: 'spotify:album:album-id' },
          track,
        },
      ],
      limit: 50,
      next: null,
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

  it('filters invalid items while continuing with a whitelisted cursor only', async () => {
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
      limit: 20,
      next:
        'https://api.spotify.com/v1/me/player/recently-played?after=456&offset=20&before=invalid',
      cursors: { after: '999' },
    });

    await expect(
      new RecentService(api).getRecentlyPlayedPage({ before: 123 }),
    ).resolves.toMatchObject({
      items: [{ track: { name: 'Numb' } }],
      nextToken: { after: 456 },
    });
    expect(api.get).toHaveBeenCalledWith('/me/player/recently-played', {
      query: { limit: 20, before: 123 },
    });
  });

  it('falls back conservatively to response cursors without following next URLs', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [],
      limit: 20,
      next: 'https://example.com/untrusted?offset=20',
      cursors: { after: '789', before: '456' },
    });

    await expect(new RecentService(api).getRecentlyPlayedPage()).resolves.toEqual({
      items: [],
      nextToken: { before: 456 },
    });
    expect(api.get).toHaveBeenCalledWith('/me/player/recently-played', {
      query: { limit: 20 },
    });
  });

  it('rejects mutually exclusive recent-history cursors when both are supplied', async () => {
    const api = createApi();
    const invalidToken = { after: 1, before: 2 } as unknown as RecentCursorToken;

    await expect(
      new RecentService(api).getRecentlyPlayedPage(invalidToken),
    ).rejects.toThrow('cannot use both before and after');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('returns no continuation for a terminal recent page', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [],
      limit: 20,
      next: null,
      cursors: { after: '789' },
    });

    await expect(new RecentService(api).getRecentlyPlayedPage()).resolves.toEqual({
      items: [],
      nextToken: null,
    });
  });
});
