import { describe, expect, it, vi } from 'vitest';

import { LibraryService } from '../src/services/library.service.js';
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

describe('LibraryService', () => {
  it('lists liked tracks from the current GET /me/tracks operation', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [{ added_at: '2026-01-01T00:00:00Z', track }],
    });

    await expect(new LibraryService(api).getLikedTracks(5)).resolves.toMatchObject([
      { addedAt: '2026-01-01T00:00:00Z', track: { name: 'Numb' } },
    ]);
    expect(api.get).toHaveBeenCalledWith('/me/tracks', { query: { limit: 5 } });
  });

  it('likes and unlikes with URI query parameters on /me/library', async () => {
    const api = createApi();
    const library = new LibraryService(api);
    await library.likeTrack(track.uri);
    await library.unlikeTrack(track.uri);

    expect(api.put).toHaveBeenCalledWith('/me/library', { query: { uris: track.uri } });
    expect(api.delete).toHaveBeenCalledWith('/me/library', {
      query: { uris: track.uri },
    });
  });

  it('likes the current track and safely ignores non-track playback', async () => {
    const api = createApi();
    vi.mocked(api.get)
      .mockResolvedValueOnce({ is_playing: true, progress_ms: 0, item: track })
      .mockResolvedValueOnce({
        is_playing: true,
        progress_ms: 0,
        item: { type: 'episode', uri: 'spotify:episode:id' },
      });
    const library = new LibraryService(api);

    await expect(library.likeCurrentTrack()).resolves.toMatchObject({ name: 'Numb' });
    await expect(library.likeCurrentTrack()).resolves.toBeNull();
    expect(api.put).toHaveBeenCalledTimes(1);
  });
});
