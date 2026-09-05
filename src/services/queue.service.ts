import type { SpotifyApi } from '../spotify/client.js';

export interface QueueItem {
  name: string;
  uri: string;
  type: 'track' | 'episode';
  subtitle: string;
  durationMs: number;
}

export interface PlaybackQueue {
  currentlyPlaying: QueueItem | null;
  queue: QueueItem[];
}

interface SpotifyQueueTrack {
  type: 'track';
  name: string;
  uri: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
}

interface SpotifyQueueEpisode {
  type: 'episode';
  name: string;
  uri: string;
  duration_ms: number;
  show: { name: string };
}

type SpotifyQueueItem = SpotifyQueueTrack | SpotifyQueueEpisode;

interface SpotifyQueueResponse {
  currently_playing: SpotifyQueueItem | null;
  queue: SpotifyQueueItem[];
}

export class QueueService {
  constructor(private readonly spotify: SpotifyApi) {}

  async getQueue(): Promise<PlaybackQueue> {
    const response = await this.spotify.get<SpotifyQueueResponse>('/me/player/queue');

    return {
      currentlyPlaying: response.currently_playing
        ? mapQueueItem(response.currently_playing)
        : null,
      queue: response.queue
        .map(mapQueueItem)
        .filter((item): item is QueueItem => item !== null),
    };
  }

  async addItem(uri: string): Promise<void> {
    await this.spotify.post<void>('/me/player/queue', { query: { uri } });
  }
}

function mapQueueItem(item: SpotifyQueueItem): QueueItem | null {
  switch (item.type) {
    case 'track':
      return {
        name: item.name,
        uri: item.uri,
        type: item.type,
        subtitle: item.artists.map((artist) => artist.name).join(', '),
        durationMs: item.duration_ms,
      };
    case 'episode':
      return {
        name: item.name,
        uri: item.uri,
        type: item.type,
        subtitle: item.show.name,
        durationMs: item.duration_ms,
      };
    default:
      return null;
  }
}
