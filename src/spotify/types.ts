export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyExternalUrls {
  spotify?: string;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  product?: string;
}

export interface SpotifyArtist {
  id: string;
  uri?: string;
  name: string;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifyFullArtist extends SpotifyArtist {
  uri: string;
  images: SpotifyImage[];
}

export interface SpotifySimplifiedAlbum {
  id?: string;
  uri?: string;
  name: string;
  album_type?: string;
  artists?: SpotifyArtist[];
  images: SpotifyImage[];
  release_date?: string;
  total_tracks?: number;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifyTrack {
  type?: 'track';
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifySimplifiedAlbum;
  is_local?: boolean;
  is_playable?: boolean;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifySimplifiedTrack {
  type?: 'track';
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  is_local?: boolean;
  is_playable?: boolean;
  external_urls?: SpotifyExternalUrls;
}

export interface SpotifyAlbum extends SpotifySimplifiedAlbum {
  id: string;
  uri: string;
  artists: SpotifyArtist[];
  tracks: SpotifyPaging<SpotifySimplifiedTrack>;
}

export interface SpotifyPlaylistOwner {
  id: string;
  display_name: string | null;
}

export interface SpotifySimplifiedPlaylist {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  public: boolean | null;
  collaborative: boolean;
  owner: SpotifyPlaylistOwner;
  images: SpotifyImage[] | null;
  external_urls?: SpotifyExternalUrls;
  items: { total: number };
}

export interface SpotifyPlaylist extends SpotifySimplifiedPlaylist {
  followers?: { total: number };
}

export interface SpotifyEpisode {
  type: 'episode';
  id?: string | null;
  uri?: string;
  name?: string;
}

export type SpotifyPlaybackItem = SpotifyTrack | SpotifyEpisode | Record<string, unknown>;

export interface SpotifyPlaylistItem {
  added_at: string | null;
  is_local: boolean;
  item: SpotifyPlaybackItem | null;
}

export interface SpotifyRecentlyPlayedItem {
  track: SpotifyPlaybackItem | null;
  played_at: string;
  context: { uri: string } | null;
}

export interface SpotifyPaging<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
  next: string | null;
  previous: string | null;
}

export interface SpotifyCursorPaging<T> {
  items: T[];
  limit: number;
  next: string | null;
  cursors?: { after?: string; before?: string };
}

export interface SpotifyPlaybackState {
  is_playing: boolean;
  repeat_state: string;
  shuffle_state: boolean;
  progress_ms: number | null;
  item: SpotifyPlaybackItem | null;
  device: {
    id: string | null;
    name: string;
    is_active: boolean;
    volume_percent: number | null;
    supports_volume: boolean;
  };
}

export interface SpotifySearchResponse {
  tracks?: SpotifyPaging<SpotifyTrack> | { items: SpotifyTrack[] };
  albums?: SpotifyPaging<SpotifySimplifiedAlbum>;
  artists?: SpotifyPaging<SpotifyFullArtist>;
  playlists?: SpotifyPaging<SpotifySimplifiedPlaylist | null>;
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

export type SpotifyRecentlyPlayedResponse =
  SpotifyCursorPaging<SpotifyRecentlyPlayedItem>;

export interface SpotifyErrorBody {
  error?: {
    status?: number;
    message?: string;
    reason?: string;
  } | string;
  error_description?: string;
}
