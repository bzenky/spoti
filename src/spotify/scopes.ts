export const LEGACY_SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
] as const;

export const SPOTIFY_SCOPES = [
  ...LEGACY_SPOTIFY_SCOPES,
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
] as const;
