import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyAlbum,
  SpotifyFullArtist,
  SpotifyPaging,
  SpotifySimplifiedAlbum,
} from '../spotify/types.js';
import { mapAlbum, mapAlbumDetail, mapArtist, normalizeLimit } from './mappers.js';
import type { Album, AlbumDetail, Artist } from './models.js';
import { nextOffsetToken, type OffsetToken, type Page } from './pagination.js';

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

  async getArtistAlbumsPage(
    id: string,
    token?: OffsetToken,
    limit = 10,
  ): Promise<Page<Album, OffsetToken>> {
    const response = await this.spotify.get<SpotifyPaging<SpotifySimplifiedAlbum>>(
      `/artists/${encodeURIComponent(id)}/albums`,
      {
        query: {
          limit: normalizeLimit(limit, 10, 10),
          offset: normalizeOffset(token?.offset),
        },
      },
    );

    return {
      items: response.items
        .map(mapAlbum)
        .filter((album): album is Album => album !== null)
        .sort(compareAlbumsNewestFirst),
      nextToken: nextOffsetToken(response),
      total: response.total,
    };
  }

  async getArtistAlbums(id: string, limit = 10): Promise<Album[]> {
    return (await this.getArtistAlbumsPage(id, undefined, limit)).items;
  }
}

function normalizeOffset(offset: number | undefined): number {
  return Number.isSafeInteger(offset) && offset! >= 0 ? offset! : 0;
}

function compareAlbumsNewestFirst(left: Album, right: Album): number {
  const leftDate = left.releaseDate ?? '';
  const rightDate = right.releaseDate ?? '';
  if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;

  const byName = left.name.localeCompare(right.name);
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
