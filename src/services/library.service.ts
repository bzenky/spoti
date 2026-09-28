import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyPaging,
  SpotifyPlaybackState,
  SpotifySavedTrack,
  SpotifyFullArtist,
  SpotifyTrack,
} from '../spotify/types.js';
import { mapArtist, mapPlaybackItem, mapTrack, normalizeLimit } from './mappers.js';
import type { Artist, SavedTrack, TopItemsRange, Track } from './models.js';
import { nextOffsetToken, type OffsetToken, type Page } from './pagination.js';

const DEFAULT_LIBRARY_LIMIT = 20;

export class LibraryService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getLikedTracks(limit = DEFAULT_LIBRARY_LIMIT): Promise<SavedTrack[]> {
    return (await this.getLikedTracksPage(undefined, limit)).items;
  }

  async getLikedTracksPage(
    token?: OffsetToken,
    limit = DEFAULT_LIBRARY_LIMIT,
    signal?: AbortSignal,
  ): Promise<Page<SavedTrack, OffsetToken>> {
    const offset = normalizeOffset(token?.offset);
    const response = await this.spotify.get<SpotifyPaging<SpotifySavedTrack>>('/me/tracks', {
      query: { limit: normalizeLimit(limit), offset },
      ...(signal === undefined ? {} : { signal }),
    });
    const items = response.items.flatMap(({ added_at: addedAt, track }) => {
      const mapped = mapTrack(track);
      return mapped ? [{ addedAt, track: mapped }] : [];
    });

    return {
      items,
      nextToken: nextOffsetToken(response),
    };
  }

  async getTopTracksPage(
    token?: OffsetToken,
    range: TopItemsRange = 'medium_term',
    limit = DEFAULT_LIBRARY_LIMIT,
    signal?: AbortSignal,
  ): Promise<Page<Track, OffsetToken>> {
    const response = await this.spotify.get<SpotifyPaging<SpotifyTrack>>('/me/top/tracks', {
      query: { limit: normalizeLimit(limit), offset: normalizeOffset(token?.offset), time_range: range },
      ...(signal === undefined ? {} : { signal }),
    });
    return {
      items: response.items.map(mapTrack).filter((track): track is Track => track !== null),
      nextToken: nextOffsetToken(response),
      total: response.total,
    };
  }

  async getTopArtistsPage(
    token?: OffsetToken,
    range: TopItemsRange = 'medium_term',
    limit = DEFAULT_LIBRARY_LIMIT,
    signal?: AbortSignal,
  ): Promise<Page<Artist, OffsetToken>> {
    const response = await this.spotify.get<SpotifyPaging<SpotifyFullArtist>>('/me/top/artists', {
      query: { limit: normalizeLimit(limit), offset: normalizeOffset(token?.offset), time_range: range },
      ...(signal === undefined ? {} : { signal }),
    });
    return {
      items: response.items.map(mapArtist),
      nextToken: nextOffsetToken(response),
      total: response.total,
    };
  }

  async likeTrack(uri: string): Promise<void> {
    await this.changeSavedState('put', uri);
  }

  async unlikeTrack(uri: string): Promise<void> {
    await this.changeSavedState('delete', uri);
  }

  async likeCurrentTrack(): Promise<Track | null> {
    return this.changeCurrentTrackSavedState('put');
  }

  async unlikeCurrentTrack(): Promise<Track | null> {
    return this.changeCurrentTrackSavedState('delete');
  }

  private async changeCurrentTrackSavedState(
    method: 'put' | 'delete',
  ): Promise<Track | null> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    const track = mapPlaybackItem(playback?.item ?? null);
    if (!track) return null;
    await this.changeSavedState(method, track.uri);
    return track;
  }

  private async changeSavedState(method: 'put' | 'delete', uri: string): Promise<void> {
    const normalizedUri = uri.trim();
    if (!normalizedUri.startsWith('spotify:track:')) return;
    await this.spotify[method]<void>('/me/library', {
      query: { uris: normalizedUri },
    });
  }
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset));
}
