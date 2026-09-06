import type { RequestOptions, SpotifyApi } from '../spotify/client.js';
import type { SpotifyPlaybackState } from '../spotify/types.js';
import { AppError, NoActiveDeviceError } from '../utils/errors.js';
import type { DeviceService } from './device.service.js';
import { mapPlaybackItem } from './mappers.js';
import type { CurrentPlayback, RepeatMode } from './models.js';

export class PlayerService {
  constructor(
    private readonly spotify: SpotifyApi,
    private readonly deviceService?: Pick<DeviceService, 'getControllableDevices'>,
  ) {}

  async getCurrentPlayback(): Promise<CurrentPlayback | null> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback?.item) return null;
    const track = mapPlaybackItem(playback.item);
    if (!track) return null;
    return {
      isPlaying: playback.is_playing,
      track,
      progressMs: playback.progress_ms ?? 0,
      deviceName: playback.device.name,
    };
  }

  async playTrack(uri: string): Promise<void> {
    await this.putWithDeviceFallback('/me/player/play', { body: { uris: [uri] } });
  }

  async playContext(contextUri: string): Promise<void> {
    await this.putWithDeviceFallback('/me/player/play', {
      body: { context_uri: contextUri },
    });
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.putWithDeviceFallback('/me/player/shuffle', {
      query: { state },
    });
  }

  async setRepeat(state: RepeatMode): Promise<void> {
    await this.putWithDeviceFallback('/me/player/repeat', {
      query: { state },
    });
  }

  async pause(): Promise<void> {
    await this.spotify.put<void>('/me/player/pause');
  }

  async resume(): Promise<void> {
    await this.putWithDeviceFallback('/me/player/play');
  }

  async next(): Promise<void> {
    await this.spotify.post<void>('/me/player/next');
  }

  async previous(): Promise<void> {
    await this.spotify.post<void>('/me/player/previous');
  }

  async setVolume(volumePercent: number): Promise<number> {
    const volume = clampVolume(volumePercent);
    await this.spotify.put<void>('/me/player/volume', {
      query: { volume_percent: volume },
    });
    return volume;
  }

  async changeVolume(delta: number): Promise<number> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback) throw new NoActiveDeviceError();
    if (!playback.device.supports_volume || playback.device.volume_percent === null) {
      throw new AppError('The active Spotify device does not support volume control.');
    }
    return this.setVolume(playback.device.volume_percent + delta);
  }

  async seek(positionMs: number): Promise<number> {
    const position = Math.max(0, Math.round(positionMs));
    await this.spotify.put<void>('/me/player/seek', {
      query: { position_ms: position },
    });
    return position;
  }

  async changePosition(deltaMs: number): Promise<number> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback?.item) {
      throw new AppError('Nothing is currently playing, so there is no position to seek.');
    }
    return this.seek((playback.progress_ms ?? 0) + deltaMs);
  }

  private async putWithDeviceFallback(
    path: string,
    options?: RequestOptions,
  ): Promise<void> {
    try {
      await this.spotify.put<void>(path, options);
      return;
    } catch (error) {
      if (!(error instanceof NoActiveDeviceError) || !this.deviceService) throw error;
    }

    const devices = await this.deviceService.getControllableDevices();
    const device = devices.length === 1 ? devices[0] : undefined;
    if (!device?.id) {
      if (devices.length > 1) {
        throw new AppError(
          'Multiple Spotify devices are available, but none is active.\n\nRun: spoti devices\nThen select one with: spoti device <number>',
        );
      }
      throw new NoActiveDeviceError();
    }

    await this.spotify.put<void>(path, {
      ...options,
      query: { ...options?.query, device_id: device.id },
    });
  }
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}
