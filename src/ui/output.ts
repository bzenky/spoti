import type {
  Album,
  AlbumDetail,
  Artist,
  CurrentPlayback,
  Playlist,
  PlaylistDetail,
  RecentlyPlayedTrack,
  SavedTrack,
  Track,
} from '../services/models.js';
import { createProgressBar, formatDuration } from '../utils/time.js';

export interface Output {
  log(message: string): void;
  error(message: string): void;
}

export const consoleOutput: Output = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

export function formatPlayback(playback: CurrentPlayback): string {
  const indicator = playback.isPlaying ? '▶' : '⏸';
  const artists = playback.track.artists.join(', ');
  const progress = Math.min(playback.progressMs, playback.track.durationMs);
  return [
    `${indicator} ${playback.track.name}`,
    `${artists} · ${playback.track.album}`,
    '',
    `${formatDuration(progress)} ${createProgressBar(progress, playback.track.durationMs)} ${formatDuration(playback.track.durationMs)}`,
  ].join('\n');
}

export function formatTrack(track: Track, index?: number): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  return `${prefix}${track.name} — ${track.artists.join(', ')} · ${track.album}`;
}

export function formatAlbum(album: Album, index?: number): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const release = album.releaseDate ? ` · ${album.releaseDate}` : '';
  return `${prefix}${album.name} — ${album.artists.join(', ')} · ${album.totalTracks} tracks${release}`;
}

export function formatAlbumDetail(album: AlbumDetail): string {
  const lines = [formatAlbum(album), '', 'Tracks:'];
  if (album.tracks.length === 0) lines.push('No playable tracks found.');
  else lines.push(...album.tracks.map((track, index) => formatTrack(track, index)));
  if (album.tracks.length < album.totalTracks) {
    lines.push(`Showing ${album.tracks.length} of ${album.totalTracks} tracks.`);
  }
  if (album.externalUrl) lines.push('', `Spotify: ${album.externalUrl}`);
  return lines.join('\n');
}

export function formatArtist(artist: Artist, index?: number): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  return `${prefix}${artist.name}`;
}

export function formatArtistDetail(artist: Artist): string {
  const lines = [formatArtist(artist)];
  if (artist.externalUrl) lines.push(`Spotify: ${artist.externalUrl}`);
  return lines.join('\n');
}

export function formatPlaylist(playlist: Playlist, index?: number): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const itemLabel = playlist.totalTracks === 1 ? 'item' : 'items';
  return `${prefix}${playlist.name} — ${playlist.ownerName} · ${playlist.totalTracks} ${itemLabel}`;
}

export function formatPlaylistOverview(playlist: Playlist): string {
  const lines = [formatPlaylist(playlist)];
  if (playlist.description) lines.push(playlist.description);
  if (playlist.externalUrl) lines.push(`Spotify: ${playlist.externalUrl}`);
  return lines.join('\n');
}

export function formatPlaylistDetail(playlist: PlaylistDetail): string {
  const lines = [formatPlaylist(playlist)];
  if (playlist.description) lines.push(playlist.description);
  lines.push('', 'Tracks:');
  if (playlist.tracks.length === 0) lines.push('No playable tracks found.');
  else lines.push(...playlist.tracks.map((track, index) => formatTrack(track, index)));
  if (playlist.externalUrl) lines.push('', `Spotify: ${playlist.externalUrl}`);
  return lines.join('\n');
}

export function formatSavedTrack(item: SavedTrack, index?: number): string {
  return `${formatTrack(item.track, index)} · liked ${item.addedAt}`;
}

export function formatRecentlyPlayed(item: RecentlyPlayedTrack, index?: number): string {
  return `${formatTrack(item.track, index)} · played ${item.playedAt}`;
}
