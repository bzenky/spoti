import { createInterface, type Interface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import type {
  Album,
  Artist,
  Playlist,
  RecentlyPlayedTrack,
  SavedTrack,
  Track,
} from '../services/models.js';
import {
  createOutputStyles,
  formatAlbum,
  formatArtist,
  formatPlaylist,
  formatTrack,
} from './output.js';

export async function selectTrack(tracks: Track[]): Promise<Track | null> {
  const styles = createOutputStyles(Boolean(stdout.isTTY), process.env);
  return selectItem(tracks, (track, index) => formatTrack(track, index, styles));
}

export async function selectAlbum(albums: Album[]): Promise<Album | null> {
  const styles = createOutputStyles(Boolean(stdout.isTTY), process.env);
  return selectItem(albums, (album, index) => formatAlbum(album, index, styles));
}

export async function selectArtist(artists: Artist[]): Promise<Artist | null> {
  const styles = createOutputStyles(Boolean(stdout.isTTY), process.env);
  return selectItem(artists, (artist, index) => formatArtist(artist, index, styles));
}

export async function selectPlaylist(playlists: Playlist[]): Promise<Playlist | null> {
  const styles = createOutputStyles(Boolean(stdout.isTTY), process.env);
  return selectItem(playlists, (playlist, index) => formatPlaylist(playlist, index, styles));
}

export async function selectRecentTrack(
  items: RecentlyPlayedTrack[],
): Promise<Track | null> {
  return selectDisplayedTrack(
    items.map((item) => item.track),
    'recent',
  );
}

export async function selectLikedTrack(items: SavedTrack[]): Promise<Track | null> {
  return selectDisplayedTrack(
    items.map((item) => item.track),
    'liked',
  );
}

export async function selectListedPlaylist(playlists: Playlist[]): Promise<Playlist | null> {
  if (playlists.length === 0 || !stdin.isTTY || !stdout.isTTY) return null;

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const index = await promptForSelection(
      prompt,
      `\nPlay a playlist [1-${playlists.length}] (Enter to keep current playback): `,
      playlists.length,
    );
    return index === null ? null : (playlists[index] ?? null);
  } finally {
    prompt.close();
  }
}

export type AlbumAction = 'play-album' | 'play-track';
export type ArtistAction = 'play-artist' | 'select-album';
export type PlaylistAction = 'play-playlist';

export async function selectAlbumAction(): Promise<AlbumAction | null> {
  return selectAction([
    { value: 'play-album', label: 'Play the entire album' },
    { value: 'play-track', label: 'Select a track' },
  ]);
}

export async function selectArtistAction(): Promise<ArtistAction | null> {
  return selectAction([
    { value: 'play-artist', label: 'Play the artist' },
    { value: 'select-album', label: 'Select an album' },
  ]);
}

export async function selectPlaylistAction(): Promise<PlaylistAction | null> {
  return selectAction([{ value: 'play-playlist', label: 'Play the playlist' }]);
}

export async function promptSpotifyClientId(): Promise<string | null> {
  if (!stdin.isTTY || !stdout.isTTY) return null;
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question('Spotify Client ID: ');
    return answer.trim() || null;
  } finally {
    prompt.close();
  }
}

export async function confirmUpdate(currentVersion: string, latestVersion: string): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) return false;
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(
      `Update spoti ${currentVersion} → ${latestVersion} with npm? [Y/n] `,
    );
    return answer.trim() === '' || /^y(?:es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function selectAction<Action extends string>(
  actions: ReadonlyArray<{ value: Action; label: string }>,
): Promise<Action | null> {
  if (!stdin.isTTY || !stdout.isTTY) return null;
  stdout.write(
    `\nWhat do you want to play?\n\n${actions
      .map((action, index) => `${index + 1}. ${action.label}`)
      .join('\n')}\n${actions.length + 1}. Nothing\n\n`,
  );
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const index = await promptForSelection(
      prompt,
      `Select [1-${actions.length + 1}]: `,
      actions.length + 1,
    );
    return index === null ? null : (actions[index]?.value ?? null);
  } finally {
    prompt.close();
  }
}

async function selectDisplayedTrack(
  tracks: Track[],
  source: 'recent' | 'liked',
): Promise<Track | null> {
  if (tracks.length === 0 || !stdin.isTTY || !stdout.isTTY) return null;

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const index = await promptForSelection(
      prompt,
      `\nPlay a ${source} track [1-${tracks.length}] (Enter to keep current playback): `,
      tracks.length,
    );
    return index === null ? null : (tracks[index] ?? null);
  } finally {
    prompt.close();
  }
}

async function selectItem<Item>(
  items: Item[],
  format: (item: Item, index?: number) => string,
): Promise<Item | null> {
  if (items.length === 0) return null;
  if (!stdin.isTTY || !stdout.isTTY) return items[0] ?? null;

  stdout.write(`${items.map((item, index) => format(item, index)).join('\n')}\n\n`);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const index = await promptForSelection(
      prompt,
      `Select [1-${items.length}] (Enter to cancel): `,
      items.length,
    );
    return index === null ? null : (items[index] ?? null);
  } finally {
    prompt.close();
  }
}

export type SelectionInput =
  | { status: 'cancelled' | 'invalid' }
  | { status: 'selected'; index: number };

export function parseSelectionInput(value: string, itemCount: number): SelectionInput {
  const normalized = value.trim();
  if (!normalized) return { status: 'cancelled' };
  if (!/^\d+$/.test(normalized)) return { status: 'invalid' };
  const index = Number(normalized) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= itemCount) {
    return { status: 'invalid' };
  }
  return { status: 'selected', index };
}

async function promptForSelection(
  prompt: Interface,
  question: string,
  itemCount: number,
): Promise<number | null> {
  while (true) {
    const result = parseSelectionInput(await prompt.question(question), itemCount);
    if (result.status === 'cancelled') return null;
    if (result.status === 'selected') return result.index;
    stdout.write(`Selection must be a number between 1 and ${itemCount}.\n`);
  }
}
