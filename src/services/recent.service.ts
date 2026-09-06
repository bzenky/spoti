import type { SpotifyApi } from '../spotify/client.js';
import type { SpotifyRecentlyPlayedResponse } from '../spotify/types.js';
import { mapPlaybackItem, normalizeLimit } from './mappers.js';
import type { RecentlyPlayedTrack } from './models.js';

const DEFAULT_RECENT_LIMIT = 20;

export class RecentService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getRecentlyPlayed(limit = DEFAULT_RECENT_LIMIT): Promise<RecentlyPlayedTrack[]> {
    const response = await this.spotify.get<SpotifyRecentlyPlayedResponse>(
      '/me/player/recently-played',
      { query: { limit: normalizeLimit(limit) } },
    );
    return response.items.flatMap(({ track, played_at: playedAt, context }) => {
      const mapped = mapPlaybackItem(track);
      if (!mapped) return [];
      return [
        {
          playedAt,
          track: mapped,
          ...(context?.uri ? { contextUri: context.uri } : {}),
        },
      ];
    });
  }
}
