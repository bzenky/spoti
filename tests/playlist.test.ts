import { describe, expect, it, vi } from 'vitest';

import { PlaylistService } from '../src/services/playlist.service.js';
import { SearchService } from '../src/services/search.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';

function createApi(): SpotifyApi {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

const playlist = {
  id: 'playlist/id',
  uri: 'spotify:playlist:playlist-id',
  name: 'Workout',
  description: 'Heavy songs',
  public: false,
  collaborative: false,
  owner: { id: 'owner-id', display_name: null },
  images: null,
  items: { total: 3 },
};

const track = {
  type: 'track',
  id: 'track-id',
  uri: 'spotify:track:track-id',
  name: 'Numb',
  duration_ms: 185_000,
  artists: [{ id: 'artist-id', name: 'Linkin Park' }],
  album: { name: 'Meteora', images: [] },
};

describe('PlaylistService', () => {
  it('lists a bounded page of private playlists', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ items: [playlist] });

    await expect(new PlaylistService(api).listPlaylists()).resolves.toMatchObject([
      { name: 'Workout', ownerName: 'owner-id', isPublic: false },
    ]);
    expect(api.get).toHaveBeenCalledWith('/me/playlists', { query: { limit: 20 } });
  });

  it('sorts user playlists deterministically for stable numeric selection', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [
        playlist,
        { ...playlist, id: 'another-id', uri: 'spotify:playlist:another-id', name: 'Focus' },
      ],
    });

    await expect(new PlaylistService(api).listPlaylists()).resolves.toMatchObject([
      { id: 'another-id', name: 'Focus' },
      { id: 'playlist/id', name: 'Workout' },
    ]);
  });

  it('loads details through the non-deprecated items endpoint and skips bad items', async () => {
    const api = createApi();
    vi.mocked(api.get)
      .mockResolvedValueOnce(playlist)
      .mockResolvedValueOnce({
        items: [
          { added_at: null, is_local: false, item: track },
          { added_at: null, is_local: false, item: null },
          { added_at: null, is_local: false, item: { type: 'episode' } },
          {
            added_at: null,
            is_local: false,
            item: { ...track, id: null, is_playable: false },
          },
        ],
      });

    await expect(new PlaylistService(api).getPlaylist('playlist/id')).resolves.toMatchObject({
      name: 'Workout',
      tracks: [{ name: 'Numb' }],
    });
    expect(api.get).toHaveBeenNthCalledWith(1, '/playlists/playlist%2Fid');
    expect(api.get).toHaveBeenNthCalledWith(2, '/playlists/playlist%2Fid/items', {
      query: { limit: 50 },
    });
  });

  it('searches playlists and ignores nullable Spotify results', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ playlists: { items: [null, playlist] } });
    await expect(new SearchService(api).searchPlaylists('Workout')).resolves.toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith('/search', {
      query: { q: 'Workout', type: 'playlist', limit: 10 },
    });
  });
});
