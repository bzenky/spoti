import { readFileSync } from 'node:fs';
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
  it('documents full-playlist filtering and Escape restoration', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/`/g, '').replace(/\s+/g, ' ');
    const site = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    expect(readme).toContain('filter all playlist tracks by title or artist');
    expect(readme).toContain('Ctrl+R to retry a failed load');
    expect(readme).toContain('Press Esc to clear the filter and return to your original page and selection');
    expect(site).toContain('press / to filter by title or artist across all pages');
    expect(site).toContain('Ctrl+R to retry a failed load');
    expect(site).toContain('Esc to clear the filter and restore your place');
  });

});
