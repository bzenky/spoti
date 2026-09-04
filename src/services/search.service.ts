import type { SpotifyApi } from '../spotify/client.js';
import type { SpotifySearchResponse, SpotifyTrack } from '../spotify/types.js';
import type { Track } from './models.js';

export class SearchService {
  constructor(private readonly spotify: SpotifyApi) {}

  async searchTracks(query: string, limit = 10): Promise<Track[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];
    const response = await this.spotify.get<SpotifySearchResponse>('/search', {
      query: { q: normalizedQuery, type: 'track', limit },
    });
    return response.tracks.items.map(mapTrack);
  }
}

function mapTrack(track: SpotifyTrack): Track {
  const externalUrl = track.external_urls?.spotify;
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album.name,
    durationMs: track.duration_ms,
    ...(externalUrl ? { externalUrl } : {}),
  };
}
