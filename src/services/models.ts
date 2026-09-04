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
