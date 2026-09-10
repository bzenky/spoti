import { describe, expect, it, vi } from 'vitest';

import { QueueService } from '../src/services/queue.service.js';
import type { SpotifyApi } from '../src/spotify/client.js';

function createApi(): SpotifyApi {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

describe('QueueService', () => {
  it('maps tracks and episodes and skips unknown item types', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({
      currently_playing: {
        type: 'track',
        name: 'Under Pressure',
        uri: 'spotify:track:track-id',
        duration_ms: 248_000,
        artists: [{ name: 'Queen' }, { name: 'David Bowie' }],
      },
      queue: [
        {
          type: 'episode',
          name: 'A Great Episode',
          uri: 'spotify:episode:episode-id',
          duration_ms: 3_600_000,
          show: { name: 'A Great Show' },
        },
        {
          type: 'audiobook',
          name: 'A Future Queue Item',
          uri: 'spotify:audiobook:audiobook-id',
          duration_ms: 7_200_000,
        },
        {
          type: 'track',
          name: 'Heroes',
          uri: 'spotify:track:second-track-id',
          duration_ms: 216_000,
          artists: [{ name: 'David Bowie' }],
        },
      ],
    });

    await expect(new QueueService(api).getQueue()).resolves.toEqual({
      currentlyPlaying: {
        type: 'track',
        name: 'Under Pressure',
        uri: 'spotify:track:track-id',
        subtitle: 'Queen, David Bowie',
        durationMs: 248_000,
      },
      queue: [
        {
          type: 'episode',
          name: 'A Great Episode',
          uri: 'spotify:episode:episode-id',
          subtitle: 'A Great Show',
          durationMs: 3_600_000,
        },
        {
          type: 'track',
          name: 'Heroes',
          uri: 'spotify:track:second-track-id',
          subtitle: 'David Bowie',
          durationMs: 216_000,
        },
      ],
    });
    expect(api.get).toHaveBeenCalledWith('/me/player/queue');
  });

  it('treats Spotify repeating only the current track as an empty queue', async () => {
    const api = createApi();
    const currentTrack = {
      type: 'track' as const,
      name: 'After Midnight',
      uri: 'spotify:track:current',
      duration_ms: 206_000,
      artists: [{ name: 'blink-182' }],
    };
    vi.mocked(api.get).mockResolvedValue({
      currently_playing: currentTrack,
      queue: Array.from({ length: 10 }, () => ({ ...currentTrack })),
    });

    await expect(new QueueService(api).getQueue()).resolves.toEqual({
      currentlyPlaying: {
        type: 'track',
        name: 'After Midnight',
        uri: 'spotify:track:current',
        subtitle: 'blink-182',
        durationMs: 206_000,
      },
      queue: [],
    });
  });

  it('preserves repeated tracks when the queue also contains another item', async () => {
    const api = createApi();
    const currentTrack = {
      type: 'track' as const,
      name: 'Current',
      uri: 'spotify:track:current',
      duration_ms: 180_000,
      artists: [{ name: 'Artist' }],
    };
    vi.mocked(api.get).mockResolvedValue({
      currently_playing: currentTrack,
      queue: [
        { ...currentTrack },
        { ...currentTrack, name: 'Next', uri: 'spotify:track:next' },
        { ...currentTrack },
      ],
    });

    const result = await new QueueService(api).getQueue();

    expect(result.queue.map((item) => item.uri)).toEqual([
      'spotify:track:current',
      'spotify:track:next',
      'spotify:track:current',
    ]);
  });

  it('adds an item using the required Spotify uri query parameter', async () => {
    const api = createApi();
    const uri = 'spotify:track:track-id';

    await new QueueService(api).addItem(uri);

    expect(api.post).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledWith('/me/player/queue', {
      query: { uri },
    });
  });

  it('passes cancellation signals through queue reads and writes', async () => {
    const api = createApi();
    vi.mocked(api.get).mockResolvedValue({ currently_playing: null, queue: [] });
    const service = new QueueService(api);
    const signal = new AbortController().signal;

    await service.getQueue(signal);
    await service.addItem('spotify:track:track-id', signal);

    expect(api.get).toHaveBeenCalledWith('/me/player/queue', { signal });
    expect(api.post).toHaveBeenCalledWith('/me/player/queue', {
      query: { uri: 'spotify:track:track-id' },
      signal,
    });
  });
});
