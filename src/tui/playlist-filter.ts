import type { Track } from '../services/models.js';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesPlaylistTrack(track: Pick<Track, 'name' | 'artists'>, query: string): boolean {
  const searchable = fold([track.name, ...track.artists].join(' '));
  return fold(query).trim().split(/\s+/u).filter(Boolean).every((word) => searchable.includes(word));
}
