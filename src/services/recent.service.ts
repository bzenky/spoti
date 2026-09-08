import type { SpotifyApi } from '../spotify/client.js';
import type { SpotifyRecentlyPlayedResponse } from '../spotify/types.js';
import { mapPlaybackItem, normalizeLimit } from './mappers.js';
import { AppError } from '../utils/errors.js';
import type { RecentlyPlayedTrack } from './models.js';
import type { Page, RecentCursorToken } from './pagination.js';

const DEFAULT_RECENT_LIMIT = 20;

export class RecentService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getRecentlyPlayed(limit = DEFAULT_RECENT_LIMIT): Promise<RecentlyPlayedTrack[]> {
    return (await this.getRecentlyPlayedPage(undefined, limit)).items;
  }

  async getRecentlyPlayedPage(
    token?: RecentCursorToken,
    limit = DEFAULT_RECENT_LIMIT,
  ): Promise<Page<RecentlyPlayedTrack, RecentCursorToken>> {
    const after = normalizeCursor(token?.after);
    const before = normalizeCursor(token?.before);
    if (after !== undefined && before !== undefined) {
      throw new AppError('Recent history pagination cannot use both before and after cursors.');
    }
    const response = await this.spotify.get<SpotifyRecentlyPlayedResponse>(
      '/me/player/recently-played',
      {
        query: {
          limit: normalizeLimit(limit),
          ...(after === undefined ? {} : { after }),
          ...(before === undefined ? {} : { before }),
        },
      },
    );
    const items = response.items.flatMap(({ track, played_at: playedAt, context }) => {
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

    return {
      items,
      nextToken: getNextCursorToken(response),
    };
  }
}

function getNextCursorToken(
  response: SpotifyRecentlyPlayedResponse,
): RecentCursorToken | null {
  if (!response.next) return null;

  try {
    const nextUrl = new URL(response.next, 'https://api.spotify.com');
    const nextToken = cursorTokenFromValues(
      nextUrl.searchParams.get('after'),
      nextUrl.searchParams.get('before'),
    );
    if (nextToken) return nextToken;
  } catch {
    // Fall back to the separately returned cursor values below.
  }

  return cursorTokenFromValues(response.cursors?.after, response.cursors?.before);
}

function cursorTokenFromValues(
  afterValue: string | null | undefined,
  beforeValue: string | null | undefined,
): RecentCursorToken | null {
  const after = parseCursor(afterValue);
  const before = parseCursor(beforeValue);
  if (before !== undefined) return { before };
  return after === undefined ? null : { after };
}

function parseCursor(value: string | null | undefined): number | undefined {
  if (value === undefined || value === null || !/^\d+$/.test(value)) return undefined;
  return normalizeCursor(Number(value));
}

function normalizeCursor(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}
