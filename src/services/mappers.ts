import type {
  SpotifyAlbum,
  SpotifyFullArtist,
  SpotifyPlaybackItem,
  SpotifyPlaylist,
  SpotifySimplifiedAlbum,
  SpotifySimplifiedPlaylist,
  SpotifySimplifiedTrack,
  SpotifyTrack,
} from '../spotify/types.js';
import type {
  Album,
  AlbumDetail,
  Artist,
  Playlist,
  Track,
} from './models.js';

export function mapTrack(track: SpotifyTrack): Track | null {
  if (!isSpotifyTrack(track) || track.is_local || track.is_playable === false) return null;
  return mapTrackFields(track, track.album.name);
}

export function mapSimplifiedTrack(
  track: SpotifySimplifiedTrack,
  albumName: string,
): Track | null {
  if (!isSpotifyTrack(track) || track.is_local || track.is_playable === false) return null;
  return mapTrackFields(track, albumName);
}

export function mapPlaybackItem(item: SpotifyPlaybackItem | null): Track | null {
  return isFullSpotifyTrack(item) ? mapTrack(item) : null;
}

export function mapAlbum(album: SpotifySimplifiedAlbum): Album | null {
  if (!album.id || !album.uri) return null;
  const imageUrl = album.images[0]?.url;
  const externalUrl = album.external_urls?.spotify;
  return {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: (album.artists ?? []).map((artist) => artist.name),
    totalTracks: album.total_tracks ?? 0,
    ...(album.release_date ? { releaseDate: album.release_date } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(externalUrl ? { externalUrl } : {}),
  };
}

export function mapAlbumDetail(album: SpotifyAlbum): AlbumDetail {
  const mapped = mapAlbum(album);
  const base: Album = mapped ?? {
    id: album.id,
    uri: album.uri,
    name: album.name,
    artists: album.artists.map((artist) => artist.name),
    totalTracks: album.total_tracks ?? album.tracks.total,
  };
  return {
    ...base,
    tracks: album.tracks.items
      .map((track) => mapSimplifiedTrack(track, album.name))
      .filter((track): track is Track => track !== null),
  };
}

export function mapArtist(artist: SpotifyFullArtist): Artist {
  const imageUrl = artist.images[0]?.url;
  const externalUrl = artist.external_urls?.spotify;
  return {
    id: artist.id,
    uri: artist.uri,
    name: artist.name,
    ...(imageUrl ? { imageUrl } : {}),
    ...(externalUrl ? { externalUrl } : {}),
  };
}

export function mapPlaylist(
  playlist: SpotifySimplifiedPlaylist | SpotifyPlaylist,
): Playlist {
  const imageUrl = playlist.images?.[0]?.url;
  const externalUrl = playlist.external_urls?.spotify;
  return {
    id: playlist.id,
    uri: playlist.uri,
    name: playlist.name,
    description: playlist.description ?? '',
    ownerName: playlist.owner.display_name ?? playlist.owner.id,
    isPublic: playlist.public,
    totalTracks: playlist.items.total,
    ...(imageUrl ? { imageUrl } : {}),
    ...(externalUrl ? { externalUrl } : {}),
  };
}

export function normalizeLimit(limit: number, defaultLimit = 20, maximum = 50): number {
  if (!Number.isFinite(limit)) return defaultLimit;
  return Math.min(maximum, Math.max(1, Math.round(limit)));
}

function mapTrackFields(track: SpotifySimplifiedTrack, albumName: string): Track {
  const externalUrl = track.external_urls?.spotify;
  return {
    id: track.id!,
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: albumName,
    durationMs: track.duration_ms,
    ...(externalUrl ? { externalUrl } : {}),
  };
}

function isSpotifyTrack(item: SpotifySimplifiedTrack): boolean {
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.uri === 'string' &&
    item.uri.startsWith('spotify:track:') &&
    typeof item.name === 'string' &&
    typeof item.duration_ms === 'number' &&
    Array.isArray(item.artists)
  );
}

function isFullSpotifyTrack(item: SpotifyPlaybackItem | null): item is SpotifyTrack {
  if (!item || item.type === 'episode' || !('album' in item)) return false;
  const candidate = item as Partial<SpotifyTrack>;
  return Boolean(candidate.album && typeof candidate.album.name === 'string');
}
