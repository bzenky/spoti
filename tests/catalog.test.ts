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

  it('lists an artist’s albums through the current discography endpoint', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ items: [album] });

    await expect(new CatalogService(api).getArtistAlbums('artist/id')).resolves.toMatchObject([
      { name: 'Meteora' },
    ]);
    expect(api.get).toHaveBeenCalledWith('/artists/artist%2Fid/albums', {
      query: { limit: 10 },
    });
  });
});
