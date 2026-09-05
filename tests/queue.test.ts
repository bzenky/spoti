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

  it('adds an item using the required Spotify uri query parameter', async () => {
    const api = createApi();
    const uri = 'spotify:track:track-id';

    await new QueueService(api).addItem(uri);

    expect(api.post).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledWith('/me/player/queue', {
      query: { uri },
    });
  });
});
