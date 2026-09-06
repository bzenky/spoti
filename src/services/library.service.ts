import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyPaging,
  SpotifyPlaybackState,
  SpotifySavedTrack,
} from '../spotify/types.js';
import { mapPlaybackItem, mapTrack, normalizeLimit } from './mappers.js';
import type { SavedTrack, Track } from './models.js';

const DEFAULT_LIBRARY_LIMIT = 20;

export class LibraryService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getLikedTracks(limit = DEFAULT_LIBRARY_LIMIT): Promise<SavedTrack[]> {
    const response = await this.spotify.get<SpotifyPaging<SpotifySavedTrack>>('/me/tracks', {
      query: { limit: normalizeLimit(limit) },
    });
    return response.items.flatMap(({ added_at: addedAt, track }) => {
      const mapped = mapTrack(track);
      return mapped ? [{ addedAt, track: mapped }] : [];
    });
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
