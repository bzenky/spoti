export interface UserProfile {
  id: string;
  displayName: string;
  product?: string;
}

export interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  durationMs: number;
  externalUrl?: string;
}

export interface CurrentPlayback {
  isPlaying: boolean;
  track: Track;
  progressMs: number;
  deviceName?: string;
}

export interface Album {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  releaseDate?: string;
  totalTracks: number;
  imageUrl?: string;
  externalUrl?: string;
}

export interface AlbumDetail extends Album {
  tracks: Track[];
}

export interface Artist {
  id: string;
  uri: string;
  name: string;
  imageUrl?: string;
  externalUrl?: string;
}

export interface Playlist {
  id: string;
  uri: string;
  name: string;
  description: string;
  ownerName: string;
  isPublic: boolean | null;
  totalTracks: number;
  imageUrl?: string;
  externalUrl?: string;
}

export interface PlaylistDetail extends Playlist {
  tracks: Track[];
}

export interface SavedTrack {
  addedAt: string;
  track: Track;
}

export interface RecentlyPlayedTrack {
  playedAt: string;
  track: Track;
  contextUri?: string;
}

export type RepeatMode = 'off' | 'track' | 'context';
export type SpotifyContextType = 'album' | 'artist' | 'playlist';
