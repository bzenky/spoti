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

  async getCurrentPlayback(signal?: AbortSignal): Promise<CurrentPlayback | null> {
    const playback =
      signal === undefined
        ? await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player')
        : await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player', { signal });
    if (!playback?.item) return null;
    const track = mapPlaybackItem(playback.item);
    if (!track) return null;
    return {
      isPlaying: playback.is_playing,
      track,
      progressMs: playback.progress_ms ?? 0,
      deviceName: playback.device.name,
      shuffleState: playback.shuffle_state,
      ...(isRepeatMode(playback.repeat_state) ? { repeatMode: playback.repeat_state } : {}),
      ...(playback.device.supports_volume && playback.device.volume_percent !== null
        ? { volumePercent: clampVolume(playback.device.volume_percent) }
        : {}),
    };
  }

  async playTrack(uri: string, signal?: AbortSignal): Promise<void> {
    await this.putWithDeviceFallback('/me/player/play', {
      body: { uris: [uri] },
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async playContext(contextUri: string, signal?: AbortSignal): Promise<void> {
    await this.putWithDeviceFallback('/me/player/play', {
      body: { context_uri: contextUri },
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async getShuffleState(): Promise<boolean> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback) throw new NoActiveDeviceError();
    if (typeof playback.shuffle_state !== 'boolean') {
      throw new AppError('Spotify did not return the current shuffle state. Try again.');
    }
    return playback.shuffle_state;
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.putWithDeviceFallback('/me/player/shuffle', {
      query: { state },
    });
  }

  async getRepeatState(): Promise<RepeatMode> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback) throw new NoActiveDeviceError();
    if (!isRepeatMode(playback.repeat_state)) {
      throw new AppError('Spotify did not return a valid repeat state. Try again.');
    }
    return playback.repeat_state;
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

  async getVolume(): Promise<number> {
    const playback = await this.spotify.get<SpotifyPlaybackState | undefined>('/me/player');
    if (!playback) throw new NoActiveDeviceError();
    if (!playback.device.supports_volume || playback.device.volume_percent === null) {
      throw new AppError('The active Spotify device does not support volume control.');
    }
    return clampVolume(playback.device.volume_percent);
  }

  async setVolume(volumePercent: number): Promise<number> {
    const volume = clampVolume(volumePercent);
    await this.spotify.put<void>('/me/player/volume', {
      query: { volume_percent: volume },
    });
    return volume;
  }

  async changeVolume(delta: number): Promise<number> {
    return this.setVolume((await this.getVolume()) + delta);
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
      options?.signal?.throwIfAborted();
      if (!(error instanceof NoActiveDeviceError) || !this.deviceService) throw error;
    }

    const devices =
      options?.signal === undefined
        ? await this.deviceService.getControllableDevices()
        : await this.deviceService.getControllableDevices(options.signal);
    options?.signal?.throwIfAborted();
    const activeDevices = devices.filter((device) => device.isActive);
    const device =
      activeDevices.length === 1 ? activeDevices[0] : devices.length === 1 ? devices[0] : undefined;
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

function isRepeatMode(value: string): value is RepeatMode {
  return value === 'off' || value === 'track' || value === 'context';
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}
