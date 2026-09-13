import { stripVTControlCharacters } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { Lyrics } from '../src/services/lyrics.service.js';
import type {
  AlbumDetail,
  Artist,
  CurrentPlayback,
  PlaylistDetail,
  Track,
} from '../src/services/models.js';
import {
  createOutputStyles,
  formatAlbum,
  formatAlbumDetail,
  formatArtist,
  formatArtistDetail,
  formatLyrics,
  formatPlayback,
  formatPlaybackShort,
  formatPlaylist,
  formatPlaylistDetail,
  formatPlaylistOverview,
  formatRecentlyPlayed,
  formatSavedTrack,
  formatTrack,
  plainOutputStyles,
  plainStyles,
  sanitizeOneLineText,
  type OutputStyles,
} from '../src/ui/output.js';

const track: Track = {
  id: 'track-1',
  uri: 'spotify:track:1',
  name: 'Midnight City',
  artists: ['M83', 'Guest'],
  album: 'Hurry Up, We’re Dreaming',
  durationMs: 240_000,
};

const album: AlbumDetail = {
  id: 'album-1',
  uri: 'spotify:album:1',
  name: 'Hurry Up, We’re Dreaming',
  artists: ['M83'],
  releaseDate: '2011-10-18',
  totalTracks: 2,
  externalUrl: 'https://open.spotify.com/album/1',
  tracks: [track],
};

const artist: Artist = {
  id: 'artist-1',
  uri: 'spotify:artist:1',
  name: 'M83',
  externalUrl: 'https://open.spotify.com/artist/1',
};

const playlist: PlaylistDetail = {
  id: 'playlist-1',
  uri: 'spotify:playlist:1',
  name: 'Night Drive',
  description: 'Songs for late roads',
  ownerName: 'Alex',
  isPublic: true,
  totalTracks: 1,
  externalUrl: 'https://open.spotify.com/playlist/1',
  tracks: [track],
};

const playback: CurrentPlayback = {
  isPlaying: true,
  track,
  progressMs: 61_000,
};

describe('output styles', () => {
  it('exports identity plain styles', () => {
    expect(plainStyles).toBe(plainOutputStyles);
    expect(plainOutputStyles.name('name')).toBe('name');
    expect(plainOutputStyles.heading('heading')).toBe('heading');
    expect(plainOutputStyles.metadata('metadata')).toBe('metadata');
    expect(plainOutputStyles.progress('progress')).toBe('progress');
  });

  it('disables colors for non-TTY output', () => {
    const styles = createOutputStyles(false, {});

    expect(styles.name('name')).toBe('name');
    expect(styles.heading('heading')).toBe('heading');
    expect(styles.metadata('metadata')).toBe('metadata');
    expect(styles.progress('progress')).toBe('progress');
  });

  it.each(['', '0'])('disables colors whenever NO_COLOR=%j is present', (value) => {
    const styles = createOutputStyles(true, { NO_COLOR: value });

    expect(styles.name('name')).toBe('name');
    expect(styles.metadata('metadata')).toBe('metadata');
    expect(styles.progress('progress')).toBe('progress');
  });

  it('enables colors only for a TTY with no NO_COLOR key', () => {
    const styles = createOutputStyles({ isTTY: true, env: {} });
    const styled = [
      styles.name('name'),
      styles.heading('heading'),
      styles.metadata('metadata'),
      styles.progress('progress'),
    ].join(' ');

    expect(styled).toContain('\u001B[');
    expect(stripVTControlCharacters(styled)).toBe('name heading metadata progress');
  });

  it('applies semantic styles without coloring separators', () => {
    const wrap = (label: string) => (value: string) => `<${label}>${value}</${label}>`;
    const styles: OutputStyles = {
      name: wrap('name'),
      heading: wrap('heading'),
      metadata: wrap('metadata'),
      progress: wrap('progress'),
    };

    expect(formatTrack(track, 0, styles)).toBe(
      '1. <name>Midnight City</name> — <metadata>M83, Guest</metadata> · <metadata>Hurry Up, We’re Dreaming</metadata>',
    );
    expect(formatAlbumDetail(album, styles)).toContain('<heading>Tracks:</heading>');
    expect(formatPlayback(playback, styles)).toContain(
      '<progress>1:01 ━━━━━━────────────────── 4:00</progress>',
    );
  });
});

describe('lyrics output', () => {
  const lyrics: Lyrics = {
    id: 1,
    trackName: 'Numb',
    artistName: 'Linkin Park',
    albumName: 'Meteora',
    durationSeconds: 185,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: '[00:01.00]First line\n[00:02.50]Second\u001B[31m line',
  };

  it('uses synced lyrics as a safe plain-text fallback and attributes LRCLIB', () => {
    const output = formatLyrics(lyrics);

    expect(output).toContain('First line\nSecond line');
    expect(output).toContain('Lyrics from LRCLIB: https://lrclib.net');
    expect(output).not.toContain('\u001B');
    expect(output).not.toContain('[00:01.00]');
  });

  it('describes instrumental tracks without inventing lyrics', () => {
    expect(formatLyrics({ ...lyrics, instrumental: true })).toContain('Instrumental track.');
  });
});

describe('plain output compatibility', () => {
  it('preserves track, album, artist, and collection summaries', () => {
    expect(formatTrack(track)).toBe(
      'Midnight City — M83, Guest · Hurry Up, We’re Dreaming',
    );
    expect(formatTrack(track, 1)).toBe(
      '2. Midnight City — M83, Guest · Hurry Up, We’re Dreaming',
    );
    expect(formatAlbum(album)).toBe(
      'Hurry Up, We’re Dreaming — M83 · 2 tracks · 2011-10-18',
    );
    expect(formatArtist(artist, 0)).toBe('1. M83');
    expect(formatPlaylist(playlist)).toBe('Night Drive — Alex · 1 item');
    expect(formatPlaylist({ ...playlist, totalTracks: 2 })).toBe(
      'Night Drive — Alex · 2 items',
    );
  });

  it('preserves detail formatter layout', () => {
    expect(formatAlbumDetail(album)).toBe(
      [
        'Hurry Up, We’re Dreaming — M83 · 2 tracks · 2011-10-18',
        '',
        'Tracks:',
        '1. Midnight City — M83, Guest · Hurry Up, We’re Dreaming',
        'Showing 1 of 2 tracks.',
        '',
        'Spotify: https://open.spotify.com/album/1',
      ].join('\n'),
    );
    expect(formatArtistDetail(artist)).toBe(
      'M83\nSpotify: https://open.spotify.com/artist/1',
    );
    expect(formatPlaylistOverview(playlist)).toBe(
      [
        'Night Drive — Alex · 1 item',
        'Songs for late roads',
        'Spotify: https://open.spotify.com/playlist/1',
      ].join('\n'),
    );
    expect(formatPlaylistDetail(playlist)).toBe(
      [
        'Night Drive — Alex · 1 item',
        'Songs for late roads',
        '',
        'Tracks:',
        '1. Midnight City — M83, Guest · Hurry Up, We’re Dreaming',
        '',
        'Spotify: https://open.spotify.com/playlist/1',
      ].join('\n'),
    );
  });

  it('preserves saved, recent, and playback output', () => {
    expect(formatSavedTrack({ track, addedAt: '2026-01-02' }, 0)).toBe(
      '1. Midnight City — M83, Guest · Hurry Up, We’re Dreaming · liked 2026-01-02',
    );
    expect(formatRecentlyPlayed({ track, playedAt: '2026-01-02' })).toBe(
      'Midnight City — M83, Guest · Hurry Up, We’re Dreaming · played 2026-01-02',
    );
    expect(formatPlaybackShort(playback)).toBe('▶ M83, Guest — Midnight City');
    expect(formatPlayback(playback)).toBe(
      [
        '▶ Midnight City',
        'M83, Guest · Hurry Up, We’re Dreaming',
        '',
        '1:01 ━━━━━━────────────────── 4:00',
      ].join('\n'),
    );
  });
});

describe('safe one-line values', () => {
  it('removes terminal sequences and standalone control characters', () => {
    const malicious = '  hello\u001B[31m\n\tworld\u001B[0m\u0000\u0007\u0008  ';

    expect(stripVTControlCharacters(malicious)).toContain('\u0007');
    expect(sanitizeOneLineText(malicious)).toBe('hello world');
  });

  it('prevents control sequences and newlines in metadata', () => {
    const maliciousPlaylist: PlaylistDetail = {
      ...playlist,
      name: 'Night\u001B[2J\nDrive',
      ownerName: 'Mallory\u001B[31m\r\nAdmin\u001B[0m',
      description: 'first line\n\tsecond line\u001B]8;;https://bad.example\u0007link\u001B]8;;\u0007',
      externalUrl: 'https://example.com/ok\nFORGED HEADING:',
    };
    const output = formatPlaylistOverview(maliciousPlaylist);

    expect(output).toBe(
      [
        'Night Drive — Mallory Admin · 1 item',
        'first line second linelink',
        'Spotify: https://example.com/ok FORGED HEADING:',
      ].join('\n'),
    );
    expect(output).not.toContain('\u001B');
  });

  it('sanitizes track metadata before optional styling is applied', () => {
    const maliciousTrack: Track = {
      ...track,
      name: '\u001B[31mFake\u001B[0m\nName',
      artists: ['Artist\r\nOne', '\u001B[1mArtist Two\u001B[0m'],
      album: 'Album\tTitle',
    };

    expect(formatTrack(maliciousTrack)).toBe(
      'Fake Name — Artist One, Artist Two · Album Title',
    );
  });
});

describe('playback progress', () => {
  it('clamps progress to the track duration', () => {
    expect(formatPlayback({ ...playback, progressMs: 999_999 })).toContain(
      '4:00 ━━━━━━━━━━━━━━━━━━━━━━━━ 4:00',
    );
  });

  it('clamps negative progress to zero', () => {
    expect(formatPlayback({ ...playback, progressMs: -1 })).toContain(
      '0:00 ──────────────────────── 4:00',
    );
  });
});
