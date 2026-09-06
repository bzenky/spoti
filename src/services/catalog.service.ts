import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyAlbum,
  SpotifyFullArtist,
  SpotifyPaging,
  SpotifySimplifiedAlbum,
} from '../spotify/types.js';
import { mapAlbum, mapAlbumDetail, mapArtist, normalizeLimit } from './mappers.js';
import type { Album, AlbumDetail, Artist } from './models.js';

export class CatalogService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getAlbum(id: string): Promise<AlbumDetail> {
    const album = await this.spotify.get<SpotifyAlbum>(`/albums/${encodeURIComponent(id)}`);
    return mapAlbumDetail(album);
  }

  async getArtist(id: string): Promise<Artist> {
    const artist = await this.spotify.get<SpotifyFullArtist>(
      `/artists/${encodeURIComponent(id)}`,
    );
    return mapArtist(artist);
  }

  async getArtistAlbums(id: string, limit = 10): Promise<Album[]> {
    const response = await this.spotify.get<SpotifyPaging<SpotifySimplifiedAlbum>>(
      `/artists/${encodeURIComponent(id)}/albums`,
      { query: { limit: normalizeLimit(limit, 10, 10) } },
    );
    return response.items
      .map(mapAlbum)
      .filter((album): album is Album => album !== null);
  }
}
