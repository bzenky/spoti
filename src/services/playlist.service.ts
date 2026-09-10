import type { SpotifyApi } from '../spotify/client.js';
import type {
  SpotifyPaging,
  SpotifyPlaylist,
  SpotifyPlaylistItem,
  SpotifySimplifiedPlaylist,
} from '../spotify/types.js';
import { mapPlaybackItem, mapPlaylist, normalizeLimit } from './mappers.js';
import type { Playlist, PlaylistDetail, Track } from './models.js';
import { nextOffsetToken, type OffsetToken, type Page } from './pagination.js';

const DEFAULT_PLAYLIST_LIMIT = 20;
const DEFAULT_ITEM_LIMIT = 50;

export class PlaylistService {
  constructor(private readonly spotify: SpotifyApi) {}

  async listPlaylists(limit = DEFAULT_PLAYLIST_LIMIT): Promise<Playlist[]> {
    return (await this.listPlaylistsPage(undefined, limit)).items;
  }

  async listPlaylistsPage(
    token?: OffsetToken,
    limit = DEFAULT_PLAYLIST_LIMIT,
    signal?: AbortSignal,
  ): Promise<Page<Playlist, OffsetToken>> {
    const response = await this.spotify.get<SpotifyPaging<SpotifySimplifiedPlaylist>>(
      '/me/playlists',
      {
        query: { limit: normalizeLimit(limit), offset: token?.offset ?? 0 },
        ...(signal === undefined ? {} : { signal }),
      },
    );
    return {
      items: response.items.map(mapPlaylist),
      nextToken: nextOffsetToken(response),
      total: response.total,
    };
  }

  async getPlaylistByNumber(number: number): Promise<Playlist | null> {
    if (!Number.isSafeInteger(number) || number < 1) return null;
    const page = await this.listPlaylistsPage({ offset: number - 1 }, 1);
    return page.items[0] ?? null;
  }

  async getPlaylist(id: string, itemLimit = DEFAULT_ITEM_LIMIT): Promise<PlaylistDetail> {
    const playlist = await this.spotify.get<SpotifyPlaylist>(
      `/playlists/${encodeURIComponent(id)}`,
    );
    const tracks = await this.getPlaylistItems(id, itemLimit);
    return { ...mapPlaylist(playlist), tracks };
  }

  async getPlaylistItems(id: string, limit = DEFAULT_ITEM_LIMIT): Promise<Track[]> {
    return (await this.getPlaylistItemsPage(id, undefined, limit)).items;
  }

  async getPlaylistItemsPage(
    id: string,
    token?: OffsetToken,
    limit = DEFAULT_ITEM_LIMIT,
    signal?: AbortSignal,
  ): Promise<Page<Track, OffsetToken>> {
    const response = await this.spotify.get<SpotifyPaging<SpotifyPlaylistItem>>(
      `/playlists/${encodeURIComponent(id)}/items`,
      {
        query: { limit: normalizeLimit(limit), offset: token?.offset ?? 0 },
        ...(signal === undefined ? {} : { signal }),
      },
    );
    return {
      items: response.items
        .map(({ item }) => mapPlaybackItem(item))
        .filter((track): track is Track => track !== null),
      nextToken: nextOffsetToken(response),
    };
  }
}
