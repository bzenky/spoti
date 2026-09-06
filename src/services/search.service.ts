import type { SpotifyApi } from '../spotify/client.js';
import type { SpotifySearchResponse } from '../spotify/types.js';
import { mapAlbum, mapArtist, mapPlaylist, mapTrack, normalizeLimit } from './mappers.js';
import type { Album, Artist, Playlist, Track } from './models.js';

const DEFAULT_SEARCH_LIMIT = 10;

export class SearchService {
  constructor(private readonly spotify: SpotifyApi) {}

  async searchTracks(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<Track[]> {
    const response = await this.search(query, 'track', limit);
    return (response?.tracks?.items ?? [])
      .map(mapTrack)
      .filter((track): track is Track => track !== null);
  }

  async searchAlbums(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<Album[]> {
    const response = await this.search(query, 'album', limit);
    return (response?.albums?.items ?? [])
      .map(mapAlbum)
      .filter((album): album is Album => album !== null);
  }

  async searchArtists(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<Artist[]> {
    const response = await this.search(query, 'artist', limit);
    return (response?.artists?.items ?? []).map(mapArtist);
  }

  async searchPlaylists(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<Playlist[]> {
    const response = await this.search(query, 'playlist', limit);
    return (response?.playlists?.items ?? [])
      .filter((playlist) => playlist !== null)
      .map(mapPlaylist);
  }

  private async search(
    query: string,
    type: 'track' | 'album' | 'artist' | 'playlist',
    limit: number,
  ): Promise<SpotifySearchResponse | null> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return null;
    return this.spotify.get<SpotifySearchResponse>('/search', {
      query: {
        q: normalizedQuery,
        type,
        limit: normalizeLimit(limit, DEFAULT_SEARCH_LIMIT, 10),
      },
    });
  }
}
