import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import type { Album, Artist, Playlist, Track } from '../services/models.js';
import { formatAlbum, formatArtist, formatPlaylist, formatTrack } from './output.js';

export async function selectTrack(tracks: Track[]): Promise<Track | null> {
  return selectItem(tracks, formatTrack);
}

export async function selectAlbum(albums: Album[]): Promise<Album | null> {
  return selectItem(albums, formatAlbum);
}

export async function selectArtist(artists: Artist[]): Promise<Artist | null> {
  return selectItem(artists, formatArtist);
}

export async function selectPlaylist(playlists: Playlist[]): Promise<Playlist | null> {
  return selectItem(playlists, formatPlaylist);
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
    const answer = await prompt.question(`Select [1-${actions.length + 1}]: `);
    const index = Number.parseInt(answer, 10) - 1;
    return actions[index]?.value ?? null;
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
    const answer = await prompt.question(`Select [1-${items.length}] (Enter to cancel): `);
    if (!answer.trim()) return null;
    const index = Number.parseInt(answer, 10) - 1;
    return items[index] ?? null;
  } finally {
    prompt.close();
  }
}
