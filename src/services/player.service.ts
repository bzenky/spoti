import type { SpotifyApi } from '../spotify/client.js';
import type { SpotifyPlaybackState } from '../spotify/types.js';
import type { CurrentPlayback, Track } from './models.js';

export class PlayerService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getCurrentPlayback(): Promise<CurrentPlayback | null> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback?.item) return null;
    return {
      isPlaying: playback.is_playing,
      track: mapTrack(playback.item),
      progressMs: playback.progress_ms ?? 0,
      deviceName: playback.device.name,
    };
  }

  async playTrack(uri: string): Promise<void> {
    await this.spotify.put<void>('/me/player/play', { body: { uris: [uri] } });
  }

  async pause(): Promise<void> {
    await this.spotify.put<void>('/me/player/pause');
  }

  async resume(): Promise<void> {
    await this.spotify.put<void>('/me/player/play');
  }

  async next(): Promise<void> {
    await this.spotify.post<void>('/me/player/next');
  }

  async previous(): Promise<void> {
    await this.spotify.post<void>('/me/player/previous');
  }
}

function mapTrack(track: SpotifyPlaybackState['item'] & {}): Track {
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
