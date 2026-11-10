import { describe, expect, it } from 'vitest';
import { matchesPlaylistTrack } from '../src/tui/playlist-filter.js';

const song = { name: 'Café Numb', artists: ['Beyoncé', 'Linkin Park'], album: 'Meteora' };

describe('playlist matching', () => {
  it('matches words across title and artists while ignoring case and accents', () => {
    for (const query of ['numb LINKIN', 'beyonce cafe', 'CAFÉ', 'linkin numb', '', '   ']) {
      expect(matchesPlaylistTrack(song, query), query).toBe(true);
    }
    for (const query of ['numb missing', 'meteora', 'numd']) {
      expect(matchesPlaylistTrack(song, query), query).toBe(false);
    }
  });

  it('preserves order and duplicate matches', () => {
    const songs = [song, { name: 'Faint', artists: ['Other'] }, song, { name: 'Numb again', artists: ['Other'] }];
    const matched = songs.filter((track) => matchesPlaylistTrack(track, 'numb'));
    expect(matched).toEqual([song, song, songs[3]]);
    expect(matched[0]).toBe(song);
    expect(matched[1]).toBe(song);
  });
});
