import { describe, expect, it, vi } from 'vitest';

import { CatalogService } from '../src/services/catalog.service.js';
import { SearchService } from '../src/services/search.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';

function createApi(): SpotifyApi {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
}

const artist = {
  id: 'artist-id',
  uri: 'spotify:artist:artist-id',
  name: 'Linkin Park',
  images: [{ url: 'artist.jpg', height: 640, width: 640 }],
  external_urls: { spotify: 'https://open.spotify.com/artist/artist-id' },
};

const album = {
  id: 'album-id',
  uri: 'spotify:album:album-id',
  name: 'Meteora',
  album_type: 'album',
  artists: [artist],
  images: [{ url: 'album.jpg', height: 640, width: 640 }],
  release_date: '2003-03-25',
  total_tracks: 1,
  tracks: {
    items: [
      {
        id: 'track-id',
        uri: 'spotify:track:track-id',
        name: 'Numb',
        duration_ms: 185_000,
        artists: [artist],
      },
    ],
    limit: 50,
    offset: 0,
    total: 1,
    next: null,
    previous: null,
  },
};

describe('catalog services', () => {
  it('searches albums and artists with finite limits', async () => {
    const api = createApi();
    vi.mocked(api.get)
      .mockResolvedValueOnce({ albums: { items: [album] } })
      .mockResolvedValueOnce({ artists: { items: [artist] } });
    const search = new SearchService(api);

    await expect(search.searchAlbums('  Meteora  ', 500)).resolves.toMatchObject([
      { name: 'Meteora', artists: ['Linkin Park'] },
    ]);
    expect(api.get).toHaveBeenNthCalledWith(1, '/search', {
      query: { q: 'Meteora', type: 'album', limit: 10 },
    });
    await expect(search.searchArtists('Linkin Park', 5)).resolves.toMatchObject([
      { name: 'Linkin Park' },
    ]);
  });

  it('gets album and artist details from their documented endpoints', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValueOnce(album).mockResolvedValueOnce(artist);
    const catalog = new CatalogService(api);

    await expect(catalog.getAlbum('album-id')).resolves.toMatchObject({
      name: 'Meteora',
      tracks: [{ name: 'Numb', album: 'Meteora' }],
    });
    await expect(catalog.getArtist('artist-id')).resolves.toMatchObject({
      name: 'Linkin Park',
    });
    expect(api.get).toHaveBeenNthCalledWith(1, '/albums/album-id');
    expect(api.get).toHaveBeenNthCalledWith(2, '/artists/artist-id');
  });

  it('gets an artist album page with a capped limit and the requested offset', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [album],
      limit: 10,
      offset: 20,
      total: 35,
      next: 'https://api.spotify.com/v1/artists/artist-id/albums?offset=30&limit=10',
      previous: 'https://api.spotify.com/v1/artists/artist-id/albums?offset=10&limit=10',
    });

    await expect(
      new CatalogService(api).getArtistAlbumsPage('artist/id', { offset: 20 }, 500),
    ).resolves.toMatchObject({
      items: [{ name: 'Meteora' }],
      nextToken: { offset: 30 },
      total: 35,
    });
    expect(api.get).toHaveBeenCalledWith('/artists/artist%2Fid/albums', {
      query: { limit: 10, offset: 20 },
    });
  });

  it('returns no token for a terminal artist album page', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [album],
      limit: 5,
      offset: 10,
      total: 11,
      next: null,
      previous: 'https://api.spotify.com/v1/artists/artist-id/albums?offset=5&limit=5',
    });

    await expect(
      new CatalogService(api).getArtistAlbumsPage('artist-id', { offset: 10 }, 5),
    ).resolves.toMatchObject({ nextToken: null, total: 11 });
  });

  it('advances artist album pages from raw paging metadata when mapped items are invalid', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      items: [album, { ...album, id: '', uri: '' }],
      limit: 2,
      offset: 0,
      total: 4,
      next: 'https://api.spotify.com/v1/artists/artist-id/albums?offset=2&limit=2',
      previous: null,
    });

    await expect(new CatalogService(api).getArtistAlbumsPage('artist-id', undefined, 2)).resolves.toMatchObject({
      items: [{ id: 'album-id' }],
      nextToken: { offset: 2 },
    });
  });

  it('sorts each artist album page newest-first without eagerly loading the next page', async () => {
    const api = createApi();
    const newest = {
      ...album,
      id: 'newest-id',
      uri: 'spotify:album:newest-id',
      name: 'Newest Album',
      release_date: '2025-02',
    };
    vi.mocked(api.get).mockResolvedValue({
      items: [album, newest],
      limit: 2,
      offset: 0,
      total: 4,
      next: 'https://api.spotify.com/v1/artists/artist-id/albums?offset=2&limit=2',
      previous: null,
    });

    await expect(new CatalogService(api).getArtistAlbums('artist/id', 2)).resolves.toMatchObject([
      { name: 'Newest Album', releaseDate: '2025-02' },
      { name: 'Meteora', releaseDate: '2003-03-25' },
    ]);
    expect(api.get).toHaveBeenCalledOnce();
  });


});
