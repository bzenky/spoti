import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifySimplifiedPlaylist,
} from '../spotify/types.js';
import { mapPlaybackItem, mapPlaylist, normalizeLimit } from './mappers.js';
import type { Playlist, PlaylistDetail, Track } from './models.js';

const DEFAULT_PLAYLIST_LIMIT = 20;
const DEFAULT_ITEM_LIMIT = 50;

export class PlaylistService {
  constructor(private readonly spotify: SpotifyApi) {}

  async listPlaylists(limit = DEFAULT_PLAYLIST_LIMIT): Promise<Playlist[]> {
    const response = await this.spotify.get<SpotifyPaging<SpotifySimplifiedPlaylist>>(
      '/me/playlists',
      { query: { limit: normalizeLimit(limit) } },
    );
    return response.items.map(mapPlaylist).sort(comparePlaylists);
  }

  async getPlaylist(id: string, itemLimit = DEFAULT_ITEM_LIMIT): Promise<PlaylistDetail> {
    const playlist = await this.spotify.get<SpotifyPlaylist>(
      `/playlists/${encodeURIComponent(id)}`,
    );
    const tracks = await this.getPlaylistItems(id, itemLimit);
    return { ...mapPlaylist(playlist), tracks };
  }

  async getPlaylistItems(id: string, limit = DEFAULT_ITEM_LIMIT): Promise<Track[]> {
    const response = await this.spotify.get<SpotifyPaging<SpotifyPlaylistItem>>(
      `/playlists/${encodeURIComponent(id)}/items`,
      { query: { limit: normalizeLimit(limit) } },
    );
    return response.items
      .map(({ item }) => mapPlaybackItem(item))
      .filter((track): track is Track => track !== null);
  }
}

function comparePlaylists(left: Playlist, right: Playlist): number {
  const nameComparison = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
  });
  if (nameComparison !== 0) return nameComparison;
  return left.id.localeCompare(right.id);
}
