import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentPlayback } from '../src/services/models.js';
import { TuiApp, type TuiPlayer } from '../src/tui/app.js';
import { DevelopmentQuotaExceededError } from '../src/utils/errors.js';
import type { TuiSearch } from '../src/tui/search-screen.js';

const playback: CurrentPlayback = {
  isPlaying: true,
  progressMs: 74_000,
  deviceName: 'Notebook',
  volumePercent: 42,
  shuffleState: true,
  repeatMode: 'track',
  track: {
    id: 'track-1',
    uri: 'spotify:track:track-1',
    name: 'Breaking the Habit',
    artists: ['Linkin Park'],
    album: 'Meteora',
    durationMs: 196_000,
  },
};

function createPlayer(): TuiPlayer {
  return {
    getCurrentPlayback: vi.fn().mockResolvedValue(playback),
    pause: vi.fn().mockResolvedValue(undefined),
    playContext: vi.fn().mockResolvedValue(undefined),
    playTrack: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    previous: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(async (position: number) => position),
    setRepeat: vi.fn().mockResolvedValue(undefined),
    setShuffle: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn(async (volume: number) => volume),
  };
}

function createSearch(): TuiSearch {
  return {
    searchAlbums: vi.fn().mockResolvedValue([]),
    searchArtists: vi.fn().mockResolvedValue([]),
    searchPlaylists: vi.fn().mockResolvedValue([]),
    searchTracks: vi.fn().mockResolvedValue([]),
  };
}

function createTuiProps(player: TuiPlayer, search: TuiSearch) {
  return {
    player,
    search,
    queue: {
      getQueue: vi.fn().mockResolvedValue({ currentlyPlaying: null, queue: [] }),
      addItem: vi.fn().mockResolvedValue(undefined),
    },
    device: {
      getControllableDevices: vi.fn().mockResolvedValue([]),
      transferPlayback: vi.fn().mockResolvedValue(undefined),
    },
    playlists: {
      listPlaylistsPage: vi.fn().mockResolvedValue({ items: [], nextToken: null }),
      getPlaylistItemsPage: vi.fn().mockResolvedValue({ items: [], nextToken: null }),
    },
    library: {
      getLikedTracksPage: vi.fn().mockResolvedValue({ items: [], nextToken: null }),
    },
    recent: {
      getRecentlyPlayedPage: vi.fn().mockResolvedValue({ items: [], nextToken: null }),
    },
    lyrics: {
      getLyrics: vi.fn().mockResolvedValue(null),
    },
    terminalSize: { columns: 100, rows: 30 },
  };
}

describe('TuiApp', () => {
  it('renders the current playback and keyboard help', async () => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );

    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('Breaking the Habit');
    });

    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Linkin Park · Meteora');
    expect(frame).toContain('Volume: 42%');
    expect(frame).toContain('Shuffle: On');
    expect(frame).toContain('Repeat: Track');
    expect(frame).toContain('Device: Notebook');
    expect(frame).toContain('[space] Play/Pause');
    expect(frame).toContain('[y] Lyrics');
    expect(frame).toContain('[/] Search');
    expect(frame).toContain('[?] Help');
    view.unmount();
  });

  it.each([
    [' ', 'pause', 1],
    ['n', 'next', 2],
    ['p', 'previous', 2],
  ] as const)('handles the %s playback shortcut', async (input, method, playbackReads) => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write(input);

    await vi.waitFor(() => expect(player[method]).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(player.getCurrentPlayback).toHaveBeenCalledTimes(playbackReads));
    view.unmount();
  });

  it.each([
    ['-', 'setVolume', 37],
    ['+', 'setVolume', 47],
    ['\u001B[D', 'seek', 64_000],
    ['\u001B[C', 'seek', 84_000],
    ['s', 'setShuffle', false],
    ['r', 'setRepeat', 'context'],
  ] as const)('handles the %s player control', async (input, method, value) => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write(input);

    await vi.waitFor(() => expect(player[method]).toHaveBeenCalledWith(value));
    expect(player.getCurrentPlayback).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('uses Ctrl+R for refresh without changing repeat', async () => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('\u0012');

    await vi.waitFor(() => expect(player.getCurrentPlayback).toHaveBeenCalledTimes(2));
    expect(player.setRepeat).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each([
    ['/', 'Spotify search'],
    ['q', 'Playback queue'],
    ['d', 'Spotify Connect devices'],
    ['l', 'Library'],
    ['?', 'Keyboard shortcuts'],
  ] as const)('opens a TUI screen with %s', async (input, expectedContent) => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write(input);

    await vi.waitFor(() => expect(view.lastFrame()).toContain(expectedContent));
    expect(view.lastFrame()).toContain('[Esc] Back');
    view.unmount();
  });

  it('opens Lyrics for the current track and fetches it once with an AbortSignal', async () => {
    const player = createPlayer();
    const props = createTuiProps(player, createSearch());
    vi.mocked(props.lyrics.getLyrics).mockResolvedValue({
      id: 1,
      trackName: playback.track.name,
      artistName: playback.track.artists[0] ?? '',
      albumName: playback.track.album,
      durationSeconds: 196,
      instrumental: false,
      plainLyrics: 'Memories consume',
      syncedLyrics: null,
    });
    const view = render(<TuiApp {...props} refreshIntervalMs={60_000} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('y');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Memories consume'));
    expect(props.lyrics.getLyrics).toHaveBeenCalledOnce();
    expect(props.lyrics.getLyrics).toHaveBeenCalledWith(playback.track, expect.any(AbortSignal));
    expect(view.lastFrame()).toContain('Lyrics from LRCLIB: https://lrclib.net');
    view.unmount();
  });

  it('does not call LRCLIB when there is no current playback', async () => {
    const player = createPlayer();
    vi.mocked(player.getCurrentPlayback).mockResolvedValue(null);
    const props = createTuiProps(player, createSearch());
    const view = render(<TuiApp {...props} refreshIntervalMs={60_000} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Nothing is currently playing.'));

    view.stdin.write('y');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Start playback in Spotify'));
    expect(props.lyrics.getLyrics).not.toHaveBeenCalled();
    view.unmount();
  });

  it('stops Spotify polling on Lyrics while the local progress clock keeps advancing', async () => {
    const player = createPlayer();
    const props = createTuiProps(player, createSearch());
    vi.mocked(props.lyrics.getLyrics).mockResolvedValue({
      id: 1,
      trackName: playback.track.name,
      artistName: playback.track.artists[0] ?? '',
      albumName: playback.track.album,
      durationSeconds: 196,
      instrumental: false,
      plainLyrics: null,
      syncedLyrics: '[01:14.00]First line\n[01:15.00]Second line',
    });
    const view = render(<TuiApp {...props} refreshIntervalMs={50} />);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('y');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ First line'));
    const readsOnEntry = vi.mocked(player.getCurrentPlayback).mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    expect(player.getCurrentPlayback).toHaveBeenCalledTimes(readsOnEntry);
    expect(view.lastFrame()).toContain('▶ Second line');
    view.unmount();
  });

  it('lists Lyrics navigation and shortcuts in Help', async () => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('?');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Keyboard shortcuts'));
    expect(view.lastFrame()).toContain('Open Lyrics');
    view.stdin.write('\u001B[B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Resume following synced lyrics'));
    view.unmount();
  });

  it('returns to Player with Escape from another screen', async () => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('?');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Keyboard shortcuts'));
    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));
    view.unmount();
  });

  it('keeps player-only shortcuts inactive on other screens', async () => {
    const player = createPlayer();
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('q');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Playback queue'));
    view.stdin.write('p');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(player.previous).not.toHaveBeenCalled();
    view.unmount();
  });

  it('searches tracks and plays the selected result', async () => {
    const player = createPlayer();
    const search = createSearch();
    vi.mocked(search.searchTracks).mockResolvedValue([playback.track]);
    const view = render(
      <TuiApp {...createTuiProps(player, search)} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('/');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Spotify search'));
    view.stdin.write('Numb');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: Numb'));
    view.stdin.write('\r');

    await vi.waitFor(() => {
      expect(search.searchTracks).toHaveBeenCalledWith('Numb', 10, expect.any(AbortSignal));
      expect(view.lastFrame()).toContain('Breaking the Habit — Linkin Park');
    });
    view.stdin.write('\r');

    await vi.waitFor(() =>
      expect(player.playTrack).toHaveBeenCalledWith(playback.track.uri, expect.any(AbortSignal)),
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ Playing Breaking the Habit'));
    view.unmount();
  });

  it('switches search categories and plays Spotify contexts', async () => {
    const player = createPlayer();
    const search = createSearch();
    vi.mocked(search.searchTracks).mockResolvedValue([playback.track]);
    vi.mocked(search.searchAlbums).mockResolvedValue([
      {
        id: 'album-1',
        uri: 'spotify:album:album-1',
        name: 'Meteora',
        artists: ['Linkin Park'],
        totalTracks: 13,
      },
    ]);
    const view = render(
      <TuiApp {...createTuiProps(player, search)} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('/');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Spotify search'));
    view.stdin.write('Linkin Park');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: Linkin Park'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(search.searchTracks).toHaveBeenCalledOnce());
    view.stdin.write('\t');

    await vi.waitFor(() => {
      expect(search.searchAlbums).toHaveBeenCalledWith(
        'Linkin Park',
        10,
        expect.any(AbortSignal),
      );
      expect(view.lastFrame()).toContain('Meteora — Linkin Park');
    });
    view.stdin.write('\r');

    await vi.waitFor(() =>
      expect(player.playContext).toHaveBeenCalledWith(
        'spotify:album:album-1',
        expect.any(AbortSignal),
      ),
    );
    view.unmount();
  });

  it('keeps search failures visible and retryable', async () => {
    const player = createPlayer();
    const search = createSearch();
    vi.mocked(search.searchTracks)
      .mockRejectedValueOnce(new Error('Temporary failure\ntry again'))
      .mockResolvedValueOnce([playback.track]);
    const view = render(
      <TuiApp {...createTuiProps(player, search)} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('/');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Spotify search'));
    view.stdin.write('Numb');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: Numb'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Temporary failure try again'));
    view.stdin.write('\r');

    await vi.waitFor(() => expect(search.searchTracks).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit — Linkin Park'));
    view.unmount();
  });

  it('cancels an active search when returning to Player', async () => {
    const player = createPlayer();
    const search = createSearch();
    let searchSignal: AbortSignal | undefined;
    vi.mocked(search.searchTracks).mockImplementation(
      async (_query, _limit, signal) =>
        new Promise((resolve) => {
          searchSignal = signal;
          signal?.addEventListener('abort', () => resolve([]), { once: true });
        }),
    );
    const view = render(
      <TuiApp {...createTuiProps(player, search)} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));

    view.stdin.write('/');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Spotify search'));
    view.stdin.write('Numb');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: Numb'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(searchSignal).toBeInstanceOf(AbortSignal));
    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));
    expect(searchSignal?.aborted).toBe(true);
    view.unmount();
  });

  it('coalesces manual refreshes while playback loading is in flight', async () => {
    const player = createPlayer();
    let resolvePlayback: ((value: CurrentPlayback) => void) | undefined;
    vi.mocked(player.getCurrentPlayback).mockImplementation(
      async () => new Promise<CurrentPlayback>((resolve) => { resolvePlayback = resolve; }),
    );
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={10} />,
    );
    await vi.waitFor(() => expect(player.getCurrentPlayback).toHaveBeenCalledOnce());

    view.stdin.write('\u0012');
    view.stdin.write('\u0012');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(player.getCurrentPlayback).toHaveBeenCalledOnce();
    resolvePlayback?.(playback);
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));
    view.unmount();
  });

  it('aborts an active playback request when leaving Player', async () => {
    const player = createPlayer();
    let playbackSignal: AbortSignal | undefined;
    vi.mocked(player.getCurrentPlayback).mockImplementation(
      async (signal) => new Promise<CurrentPlayback | null>((resolve) => {
        playbackSignal = signal;
        signal?.addEventListener('abort', () => resolve(null), { once: true });
      }),
    );
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );
    await vi.waitFor(() => expect(playbackSignal).toBeInstanceOf(AbortSignal));

    view.stdin.write('?');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Keyboard shortcuts'));
    expect(playbackSignal?.aborted).toBe(true);
    view.unmount();
  });

  it('pauses automatic polling after quota exhaustion and permits a manual retry', async () => {
    const player = createPlayer();
    vi.mocked(player.getCurrentPlayback)
      .mockRejectedValueOnce(new DevelopmentQuotaExceededError(3_600))
      .mockResolvedValue(playback);
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={10} />,
    );

    await vi.waitFor(() => expect(view.lastFrame()).toContain('development quota exceeded'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(player.getCurrentPlayback).toHaveBeenCalledOnce();

    view.stdin.write('\u0012');
    await vi.waitFor(() => expect(player.getCurrentPlayback).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Breaking the Habit'));
    view.unmount();
  });

  it('renders a minimum-size fallback and compact navigation without overflowing rows', async () => {
    const player = createPlayer();
    const props = createTuiProps(player, createSearch());
    const tiny = render(<TuiApp {...props} terminalSize={{ columns: 31, rows: 9 }} />);
    expect(tiny.lastFrame()).toContain('Terminal too small');
    tiny.unmount();

    const compact = render(<TuiApp {...props} terminalSize={{ columns: 40, rows: 12 }} />);
    await vi.waitFor(() => expect(compact.lastFrame()).toContain('Breaking the Habit'));
    const frame = compact.lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(12);
    expect(frame).toContain('[1]  [y]  [/]  [q]  [d]  [l]  [?]');
    expect(frame).not.toContain('[1] Player');
    compact.unmount();
  });

  it('truncates long playback metadata within a narrow terminal', async () => {
    const player = createPlayer();
    vi.mocked(player.getCurrentPlayback).mockResolvedValue({
      ...playback,
      deviceName: 'A very long device name that should never wrap onto another terminal row',
      track: {
        ...playback.track,
        name: 'A very long track title that should be safely truncated at the viewport edge',
        artists: ['A very long artist name that should be clipped'],
        album: 'A very long album name that should also be clipped',
      },
    });
    const view = render(
      <TuiApp
        {...createTuiProps(player, createSearch())}
        terminalSize={{ columns: 40, rows: 14 }}
        refreshIntervalMs={60_000}
      />,
    );

    await vi.waitFor(() => expect(view.lastFrame()).toContain('A very long track'));
    expect((view.lastFrame() ?? '').split('\n')).toHaveLength(14);
    view.unmount();
  });

  it('shows actionable errors without terminating the interface', async () => {
    const player = createPlayer();
    vi.mocked(player.getCurrentPlayback).mockRejectedValue(new Error('Spotify unavailable\nretry'));
    const view = render(
      <TuiApp {...createTuiProps(player, createSearch())} refreshIntervalMs={60_000} />,
    );

    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('Spotify unavailable retry');
    });

    expect(view.lastFrame()).not.toContain('Spotify unavailable\nretry');
    expect(view.lastFrame()).not.toContain('Nothing is currently playing.');
    view.unmount();
  });
});
