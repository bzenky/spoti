import { createColors } from 'picocolors';

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
import { sanitizeOneLineText } from '../utils/text.js';

export { sanitizeOneLineText } from '../utils/text.js';

export interface Output {
  log(message: string): void;
  error(message: string): void;
}

export const consoleOutput: Output = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

type OutputStyle = (value: string) => string;

export interface OutputStyles {
  name: OutputStyle;
  heading: OutputStyle;
  metadata: OutputStyle;
  progress: OutputStyle;
}

const identity: OutputStyle = (value) => value;

export const plainOutputStyles: OutputStyles = Object.freeze({
  name: identity,
  heading: identity,
  metadata: identity,
  progress: identity,
});

export const plainStyles = plainOutputStyles;

interface OutputStyleOptions {
  isTTY?: boolean | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

export function createOutputStyles(
  isTTY?: boolean,
  env?: NodeJS.ProcessEnv,
): OutputStyles;
export function createOutputStyles(options?: OutputStyleOptions): OutputStyles;
export function createOutputStyles(
  isTTYOrOptions: boolean | OutputStyleOptions | undefined = process.stdout.isTTY,
  environment: NodeJS.ProcessEnv = process.env,
): OutputStyles {
  const isOptions = typeof isTTYOrOptions === 'object';
  const isTTY = isOptions
    ? (isTTYOrOptions.isTTY ?? process.stdout.isTTY)
    : isTTYOrOptions;
  const env = isOptions ? (isTTYOrOptions.env ?? process.env) : environment;
  const colors = createColors(isTTY === true && !('NO_COLOR' in env));

  return {
    name: colors.bold,
    heading: colors.bold,
    metadata: colors.dim,
    progress: colors.green,
  };
}


export function formatPlayback(
  playback: CurrentPlayback,
  styles: OutputStyles = plainOutputStyles,
): string {
  const indicator = playback.isPlaying ? '▶' : '⏸';
  const artists = playback.track.artists.map(sanitizeOneLineText).join(', ');
  const duration = Math.max(0, playback.track.durationMs);
  const progress = Math.min(Math.max(0, playback.progressMs), duration);
  const progressLine = `${formatDuration(progress)} ${createProgressBar(progress, duration)} ${formatDuration(duration)}`;
  return [
    `${indicator} ${styles.name(sanitizeOneLineText(playback.track.name))}`,
    styles.metadata(`${artists} · ${sanitizeOneLineText(playback.track.album)}`),
    '',
    styles.progress(progressLine),
  ].join('\n');
}

export function formatTrack(
  track: Track,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const artists = track.artists.map(sanitizeOneLineText).join(', ');
  return `${prefix}${styles.name(sanitizeOneLineText(track.name))} — ${styles.metadata(artists)} · ${styles.metadata(sanitizeOneLineText(track.album))}`;
}

export function formatAlbum(
  album: Album,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const release = album.releaseDate
    ? ` · ${styles.metadata(sanitizeOneLineText(album.releaseDate))}`
    : '';
  const artists = album.artists.map(sanitizeOneLineText).join(', ');
  return `${prefix}${styles.name(sanitizeOneLineText(album.name))} — ${styles.metadata(artists)} · ${styles.metadata(`${album.totalTracks} tracks`)}${release}`;
}

export function formatAlbumDetail(
  album: AlbumDetail,
  styles: OutputStyles = plainOutputStyles,
): string {
  const lines = [formatAlbum(album, undefined, styles), '', styles.heading('Tracks:')];
  if (album.tracks.length === 0) lines.push('No playable tracks found.');
  else {
    lines.push(
      ...album.tracks.map((track, index) => formatTrack(track, index, styles)),
    );
  }
  if (album.tracks.length < album.totalTracks) {
    lines.push(styles.metadata(`Showing ${album.tracks.length} of ${album.totalTracks} tracks.`));
  }
  if (album.externalUrl) {
    lines.push('', styles.metadata(`Spotify: ${sanitizeOneLineText(album.externalUrl)}`));
  }
  return lines.join('\n');
}

export function formatArtist(
  artist: Artist,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  return `${prefix}${styles.name(sanitizeOneLineText(artist.name))}`;
}

export function formatArtistDetail(
  artist: Artist,
  styles: OutputStyles = plainOutputStyles,
): string {
  const lines = [formatArtist(artist, undefined, styles)];
  if (artist.externalUrl) {
    lines.push(styles.metadata(`Spotify: ${sanitizeOneLineText(artist.externalUrl)}`));
  }
  return lines.join('\n');
}

export function formatPlaylist(
  playlist: Playlist,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const prefix = index === undefined ? '' : `${index + 1}. `;
  const itemLabel = playlist.totalTracks === 1 ? 'item' : 'items';
  const metadata = `${sanitizeOneLineText(playlist.ownerName)} · ${playlist.totalTracks} ${itemLabel}`;
  return `${prefix}${styles.name(sanitizeOneLineText(playlist.name))} — ${styles.metadata(metadata)}`;
}

export function formatPlaylistOverview(
  playlist: Playlist,
  styles: OutputStyles = plainOutputStyles,
): string {
  const lines = [formatPlaylist(playlist, undefined, styles)];
  if (playlist.description) {
    lines.push(styles.metadata(sanitizeOneLineText(playlist.description)));
  }
  if (playlist.externalUrl) {
    lines.push(styles.metadata(`Spotify: ${sanitizeOneLineText(playlist.externalUrl)}`));
  }
  return lines.join('\n');
}

export function formatPlaylistDetail(
  playlist: PlaylistDetail,
  styles: OutputStyles = plainOutputStyles,
): string {
  const lines = [formatPlaylist(playlist, undefined, styles)];
  if (playlist.description) {
    lines.push(styles.metadata(sanitizeOneLineText(playlist.description)));
  }
  lines.push('', styles.heading('Tracks:'));
  if (playlist.tracks.length === 0) lines.push('No playable tracks found.');
  else {
    lines.push(
      ...playlist.tracks.map((track, index) => formatTrack(track, index, styles)),
    );
  }
  if (playlist.externalUrl) {
    lines.push('', styles.metadata(`Spotify: ${sanitizeOneLineText(playlist.externalUrl)}`));
  }
  return lines.join('\n');
}

export function formatSavedTrack(
  item: SavedTrack,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const playedMetadata = styles.metadata(`liked ${sanitizeOneLineText(item.addedAt)}`);
  return `${formatTrack(item.track, index, styles)} · ${playedMetadata}`;
}

export function formatRecentlyPlayed(
  item: RecentlyPlayedTrack,
  index?: number,
  styles: OutputStyles = plainOutputStyles,
): string {
  const playedMetadata = styles.metadata(`played ${sanitizeOneLineText(item.playedAt)}`);
  return `${formatTrack(item.track, index, styles)} · ${playedMetadata}`;
}
