import { render } from 'ink-testing-library';
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { Playlist, RecentlyPlayedTrack, Track } from '../src/services/models.js';
import type { Page, OffsetToken, RecentCursorToken } from '../src/services/pagination.js';
import {
  LibraryScreen,
  type LibraryPlayer,
  type TuiLikedLibrary,
  type TuiPlaylistLibrary,
  type TuiRecentLibrary,
} from '../src/tui/library-screen.js';

const track: Track = {
  id: 'track-1',
  uri: 'spotify:track:track-1',
  name: 'Numb',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 185_000,
};

const playlist: Playlist = {
  id: 'playlist-1',
  uri: 'spotify:playlist:playlist-1',
  name: 'Workout',
  description: '',
  ownerName: 'Zenky',
  isPublic: false,
  totalTracks: 2,
};

interface Dependencies {
  playlists: TuiPlaylistLibrary;
  library: TuiLikedLibrary;
  recent: TuiRecentLibrary;
  player: LibraryPlayer;
  onBack: Mock<() => void>;
}

function dependencies(): Dependencies {
  return {
    playlists: {
      listPlaylistsPage: vi.fn().mockResolvedValue({ items: [playlist], nextToken: null }),
      getPlaylistItemsPage: vi.fn().mockResolvedValue({ items: [track], nextToken: null }),
    },
    library: {
      getLikedTracksPage: vi.fn().mockResolvedValue({
        items: [{ addedAt: '2026-09-05T00:00:00Z', track }],
        nextToken: null,
      }),
    },
    recent: {
      getRecentlyPlayedPage: vi.fn().mockResolvedValue({
        items: [{ playedAt: '2026-09-04T00:00:00Z', track }],
        nextToken: null,
      }),
    },
    player: { playTrack: vi.fn().mockResolvedValue(undefined) },
    onBack: vi.fn(),
  };
}

function renderLibrary(deps: Dependencies) {
  return render(
    <LibraryScreen
      playlists={deps.playlists}
      library={deps.library}
      recent={deps.recent}
      player={deps.player}
      onBack={deps.onBack}
    />,
  );
}

describe('LibraryScreen', () => {
  it('loads categories lazily and plays liked and recent tracks', async () => {
    const deps = dependencies();
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout — Zenky · 2 tracks'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledWith(
      undefined,
      20,
      expect.any(AbortSignal),
    );
    expect(deps.library.getLikedTracksPage).not.toHaveBeenCalled();
    expect(deps.recent.getRecentlyPlayedPage).not.toHaveBeenCalled();

    view.stdin.write('\t');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('liked 2026-09-05T00:00:00Z'));
    expect(deps.library.getLikedTracksPage).toHaveBeenCalledWith(
      undefined,
      20,
      expect.any(AbortSignal),
    );
    view.stdin.write('\r');
    await vi.waitFor(() =>
      expect(deps.player.playTrack).toHaveBeenCalledWith(track.uri, expect.any(AbortSignal)),
    );
    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ Playing Numb'));

    view.stdin.write('\t');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('played 2026-09-04T00:00:00Z'));
    expect(deps.recent.getRecentlyPlayedPage).toHaveBeenCalledWith(
      undefined,
      20,
      expect.any(AbortSignal),
    );
    view.unmount();
  });

  it('uses next tokens and restores visited pages from the session cache', async () => {
    const deps = dependencies();
    const secondPlaylist = { ...playlist, id: 'playlist-2', name: 'Focus' };
    vi.mocked(deps.playlists.listPlaylistsPage)
      .mockResolvedValueOnce({ items: [playlist], nextToken: { offset: 20 } })
      .mockResolvedValueOnce({ items: [secondPlaylist], nextToken: null });
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('n');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Focus'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenNthCalledWith(
      2,
      { offset: 20 },
      20,
      expect.any(AbortSignal),
    );

    view.stdin.write('p');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('n');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Focus'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('browses playlist tracks lazily, plays a selected track, and backs out one level at a time', async () => {
    const deps = dependencies();
    const secondTrack = { ...track, id: 'track-2', uri: 'spotify:track:track-2', name: 'Faint' };
    vi.mocked(deps.playlists.getPlaylistItemsPage)
      .mockResolvedValueOnce({ items: [track], nextToken: { offset: 50 } })
      .mockResolvedValueOnce({ items: [secondTrack], nextToken: null });
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Playlist tracks'));
    expect(deps.playlists.getPlaylistItemsPage).toHaveBeenCalledWith(
      playlist.id,
      undefined,
      50,
      expect.any(AbortSignal),
    );

    view.stdin.write('n');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Faint — Linkin Park'));
    expect(deps.playlists.getPlaylistItemsPage).toHaveBeenNthCalledWith(
      2,
      playlist.id,
      { offset: 50 },
      50,
      expect.any(AbortSignal),
    );
    view.stdin.write('\r');
    await vi.waitFor(() =>
      expect(deps.player.playTrack).toHaveBeenCalledWith(secondTrack.uri, expect.any(AbortSignal)),
    );

    view.stdin.write('\u001B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Playlists  Liked  Recent'));
    expect(deps.onBack).not.toHaveBeenCalled();
    view.stdin.write('\u001B');
    await vi.waitFor(() => expect(deps.onBack).toHaveBeenCalledOnce());
    view.unmount();
  });

  it('keeps page failures terminal-safe and retryable', async () => {
    const deps = dependencies();
    vi.mocked(deps.playlists.listPlaylistsPage)
      .mockRejectedValueOnce(new Error('Temporary\nfailure\u001B[31m'))
      .mockResolvedValueOnce({ items: [playlist], nextToken: null });
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Temporary failure'));
    expect(view.lastFrame()).not.toContain('\u001B[31m');
    expect(view.lastFrame()).toContain('Press r or Enter to retry.');
    view.stdin.write('r');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout — Zenky'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('ignores a playlist page that resolves after Back', async () => {
    const deps = dependencies();
    let resolveTracks: ((page: Page<Track, OffsetToken>) => void) | undefined;
    vi.mocked(deps.playlists.getPlaylistItemsPage).mockImplementation(
      async () => new Promise((resolve) => { resolveTracks = resolve; }),
    );
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Loading playlist tracks'));
    view.stdin.write('\u001B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout — Zenky'));

    resolveTracks?.({ items: [{ ...track, name: 'Late result' }], nextToken: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).not.toContain('Late result');
    expect(deps.onBack).not.toHaveBeenCalled();
    view.unmount();
  });

  it('aborts active playback when unmounted', async () => {
    const deps = dependencies();
    let playbackSignal: AbortSignal | undefined;
    vi.mocked(deps.player.playTrack).mockImplementation(
      async (_uri, signal) => new Promise((resolve) => {
        playbackSignal = signal;
        signal?.addEventListener('abort', () => resolve(), { once: true });
      }),
    );
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\t');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('liked 2026'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(playbackSignal).toBeInstanceOf(AbortSignal));

    view.unmount();
    expect(playbackSignal?.aborted).toBe(true);
  });

  it('passes recent cursor tokens without translating them', async () => {
    const deps = dependencies();
    const cursor: RecentCursorToken = { before: 1234 };
    const first: RecentlyPlayedTrack = { playedAt: 'first', track };
    const second: RecentlyPlayedTrack = { playedAt: 'second', track: { ...track, id: 'track-2' } };
    vi.mocked(deps.recent.getRecentlyPlayedPage)
      .mockResolvedValueOnce({ items: [first], nextToken: cursor })
      .mockResolvedValueOnce({ items: [second], nextToken: null });
    const view = renderLibrary(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\t');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('liked 2026'));
    view.stdin.write('\t');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('played first'));
    view.stdin.write('n');

    await vi.waitFor(() => expect(view.lastFrame()).toContain('played second'));
    expect(deps.recent.getRecentlyPlayedPage).toHaveBeenNthCalledWith(
      2,
      cursor,
      20,
      expect.any(AbortSignal),
    );
    view.unmount();
  });
});
