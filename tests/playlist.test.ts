import { describe, expect, it, vi } from 'vitest';

import { PlaylistService } from '../src/services/playlist.service.js';
import { SearchService } from '../src/services/search.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';

function createApi(): SpotifyApi {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

function page<T>(
  items: T[],
  overrides: Partial<{
    limit: number;
    offset: number;
    total: number;
    next: string | null;
    previous: string | null;
  }> = {},
) {
  return {
    items,
    limit: 20,
    offset: 0,
    total: items.length,
    next: null,
    previous: null,
    ...overrides,
  };
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
    vi.mocked(api.get).mockResolvedValue(page([playlist]));

    await expect(new PlaylistService(api).listPlaylists()).resolves.toMatchObject([
      { name: 'Workout', ownerName: 'owner-id', isPublic: false },
    ]);
    expect(api.get).toHaveBeenCalledWith('/me/playlists', {
      query: { limit: 20, offset: 0 },
    });
  });

  it('preserves Spotify playlist order so global page numbers remain stable', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(
      page([
        playlist,
        { ...playlist, id: 'another-id', uri: 'spotify:playlist:another-id', name: 'Focus' },
      ]),
    );

    await expect(new PlaylistService(api).listPlaylists()).resolves.toMatchObject([
      { id: 'playlist/id', name: 'Workout' },
      { id: 'another-id', name: 'Focus' },
    ]);
  });

  it('uses offsets, caps playlist limits, and derives the next token from raw paging', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(
      page(
        [
          playlist,
          { ...playlist, id: 'another-id', uri: 'spotify:playlist:another-id', name: 'Focus' },
        ],
        {
          limit: 50,
          offset: 40,
          total: 120,
          next: 'https://api.spotify.com/v1/me/playlists?offset=90&limit=50',
        },
      ),
    );

    await expect(
      new PlaylistService(api).listPlaylistsPage({ offset: 40 }, 100),
    ).resolves.toMatchObject({
      items: [
        { id: 'playlist/id', name: 'Workout' },
        { id: 'another-id', name: 'Focus' },
      ],
      nextToken: { offset: 90 },
      total: 120,
    });
    expect(api.get).toHaveBeenCalledWith('/me/playlists', {
      query: { limit: 50, offset: 40 },
    });
  });

  it('resolves a displayed playlist number directly by Spotify offset', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(page([playlist], { limit: 1, offset: 74, total: 100 }));

    await expect(new PlaylistService(api).getPlaylistByNumber(75)).resolves.toMatchObject({
      id: 'playlist/id',
    });
    expect(api.get).toHaveBeenCalledWith('/me/playlists', {
      query: { limit: 1, offset: 74 },
    });
  });

  it('returns no playlist token for a terminal raw page', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(
      page([playlist], { limit: 20, offset: 40, total: 41, next: null }),
    );

    await expect(
      new PlaylistService(api).listPlaylistsPage({ offset: 40 }),
    ).resolves.toMatchObject({ nextToken: null, total: 41 });
  });

  it('loads details through the non-deprecated items endpoint and skips bad items', async () => {
    const api = createApi();
    vi.mocked(api.get)
      .mockResolvedValueOnce(playlist)
      .mockResolvedValueOnce(
        page([
          { added_at: null, is_local: false, item: track },
          { added_at: null, is_local: false, item: null },
          { added_at: null, is_local: false, item: { type: 'episode' } },
          {
            added_at: null,
            is_local: false,
            item: { ...track, id: null, is_playable: false },
          },
        ], { limit: 50 }),
      );

    await expect(new PlaylistService(api).getPlaylist('playlist/id')).resolves.toMatchObject({
      name: 'Workout',
      tracks: [{ name: 'Numb' }],
    });
    expect(api.get).toHaveBeenNthCalledWith(1, '/playlists/playlist%2Fid');
    expect(api.get).toHaveBeenNthCalledWith(2, '/playlists/playlist%2Fid/items', {
      query: { limit: 50, offset: 0 },
    });
  });

  it('pages playlist items using raw metadata despite filtered items', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(
      page(
        [
          { added_at: null, is_local: false, item: track },
          { added_at: null, is_local: false, item: null },
          { added_at: null, is_local: false, item: { type: 'episode' } },
          {
            added_at: null,
            is_local: false,
            item: { ...track, id: null, is_playable: false },
          },
        ],
        {
          limit: 50,
          offset: 100,
          total: 200,
          next: 'https://api.spotify.com/v1/playlists/id/items?offset=150&limit=50',
        },
      ),
    );

    await expect(
      new PlaylistService(api).getPlaylistItemsPage('playlist/id', { offset: 100 }, 75),
    ).resolves.toMatchObject({
      items: [{ id: 'track-id', name: 'Numb' }],
      nextToken: { offset: 150 },
    });
    expect(api.get).toHaveBeenCalledWith('/playlists/playlist%2Fid/items', {
      query: { limit: 50, offset: 100 },
    });
  });

  it('returns no playlist-item token for a terminal raw page', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue(
      page([{ added_at: null, is_local: false, item: null }], {
        limit: 50,
        offset: 150,
        total: 151,
        next: null,
      }),
    );

    await expect(
      new PlaylistService(api).getPlaylistItemsPage('id', { offset: 150 }),
    ).resolves.toEqual({ items: [], nextToken: null });
  });

  it('searches playlists and ignores nullable Spotify results', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ playlists: page([null, playlist]) });
    await expect(new SearchService(api).searchPlaylists('Workout')).resolves.toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith('/search', {
      query: { q: 'Workout', type: 'playlist', limit: 10 },
    });
  });
});
