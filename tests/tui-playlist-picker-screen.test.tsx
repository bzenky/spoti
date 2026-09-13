import { render } from 'ink-testing-library';
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { Playlist, Track } from '../src/services/models.js';
import type { OffsetToken, Page } from '../src/services/pagination.js';
import {
  PlaylistPickerScreen,
  type PlaylistPickerSessionCache,
  type TuiPlaylistPicker,
} from '../src/tui/playlist-picker-screen.js';

const track: Track = {
  id: 'track-1',
  uri: 'spotify:track:track-1',
  name: 'Breaking the Habit',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 196_000,
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
  playlists: TuiPlaylistPicker;
  onAdded: Mock<(selected: Playlist) => void>;
  onBack: Mock<() => void>;
}

function dependencies(): Dependencies {
  return {
    playlists: {
      listPlaylistsPage: vi.fn().mockResolvedValue({ items: [playlist], nextToken: null }),
      addItems: vi.fn().mockResolvedValue(undefined),
    },
    onAdded: vi.fn(),
    onBack: vi.fn(),
  };
}

function renderPicker(
  deps: Dependencies,
  options: { sessionCache?: PlaylistPickerSessionCache; availableRows?: number } = {},
) {
  return render(
    <PlaylistPickerScreen
      playlists={deps.playlists}
      track={track}
      sessionCache={options.sessionCache}
      availableRows={options.availableRows}
      onAdded={deps.onAdded}
      onBack={deps.onBack}
    />,
  );
}

describe('PlaylistPickerScreen', () => {
  it('loads pages lazily, submits the current track URI, and reports success', async () => {
    const deps = dependencies();
    const secondPlaylist = { ...playlist, id: 'playlist-2', name: 'Focus' };
    vi.mocked(deps.playlists.listPlaylistsPage)
      .mockResolvedValueOnce({ items: [playlist], nextToken: { offset: 20 } })
      .mockResolvedValueOnce({ items: [secondPlaylist], nextToken: null });
    const sessionCache: PlaylistPickerSessionCache = { pages: [], index: 0 };
    const view = renderPicker(deps, { sessionCache });

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout — Zenky · 2 tracks'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledWith(
      undefined,
      20,
      expect.any(AbortSignal),
    );
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledOnce();

    view.stdin.write('n');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Focus'));
    expect(deps.playlists.listPlaylistsPage).toHaveBeenNthCalledWith(
      2,
      { offset: 20 },
      20,
      expect.any(AbortSignal),
    );

    view.stdin.write('\r');
    await vi.waitFor(() =>
      expect(deps.playlists.addItems).toHaveBeenCalledWith(
        secondPlaylist.id,
        [track.uri],
        expect.any(AbortSignal),
      ),
    );
    await vi.waitFor(() =>
      expect(deps.onAdded).toHaveBeenCalledWith({ ...secondPlaylist, totalTracks: 3 }),
    );
    expect(sessionCache.pages[1]?.items[0]?.totalTracks).toBe(3);
    view.unmount();
  });

  it('restores visited pages from a session-only cache without refetching', async () => {
    const deps = dependencies();
    const secondPlaylist = { ...playlist, id: 'playlist-2', name: 'Focus' };
    const sessionCache: PlaylistPickerSessionCache = { pages: [], index: 0 };
    vi.mocked(deps.playlists.listPlaylistsPage)
      .mockResolvedValueOnce({ items: [playlist], nextToken: { offset: 20 } })
      .mockResolvedValueOnce({ items: [secondPlaylist], nextToken: null });
    const firstView = renderPicker(deps, { sessionCache });

    await vi.waitFor(() => expect(firstView.lastFrame()).toContain('Workout'));
    firstView.stdin.write('n');
    await vi.waitFor(() => expect(firstView.lastFrame()).toContain('Focus'));
    firstView.unmount();

    const secondView = renderPicker(deps, { sessionCache });
    expect(secondView.lastFrame()).toContain('Focus');
    expect(deps.playlists.listPlaylistsPage).toHaveBeenCalledTimes(2);
    secondView.unmount();
  });

  it('keeps add failures terminal-safe and retryable', async () => {
    const deps = dependencies();
    vi.mocked(deps.playlists.addItems)
      .mockRejectedValueOnce(new Error('Denied\n\u001B[31m'))
      .mockResolvedValueOnce(undefined);
    const view = renderPicker(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Unable to add track: Denied'));
    expect(view.lastFrame()).not.toContain('\u001B[31m');
    expect(view.lastFrame()).toContain('Press Enter to retry or Esc to cancel.');

    view.stdin.write('\r');
    await vi.waitFor(() => expect(deps.playlists.addItems).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(deps.onAdded).toHaveBeenCalledWith({ ...playlist, totalTracks: 3 }),
    );
    view.unmount();
  });

  it('aborts an active add and returns when cancelled', async () => {
    const deps = dependencies();
    let addSignal: AbortSignal | undefined;
    vi.mocked(deps.playlists.addItems).mockImplementation(
      async (_playlistId, _uris, signal) =>
        new Promise((resolve) => {
          addSignal = signal;
          signal?.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    const view = renderPicker(deps);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(addSignal).toBeInstanceOf(AbortSignal));
    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(deps.onBack).toHaveBeenCalledOnce());
    expect(addSignal?.aborted).toBe(true);
    expect(deps.onAdded).not.toHaveBeenCalled();
    view.unmount();
  });

  it('aborts a pending page request when cancelled and clips long lists to available rows', async () => {
    const deps = dependencies();
    let resolvePage: ((page: Page<Playlist, OffsetToken>) => void) | undefined;
    let pageSignal: AbortSignal | undefined;
    vi.mocked(deps.playlists.listPlaylistsPage).mockImplementation(
      async (_token, _limit, signal) =>
        new Promise((resolve) => {
          resolvePage = resolve;
          pageSignal = signal;
        }),
    );
    const pendingView = renderPicker(deps);
    await vi.waitFor(() => expect(pageSignal).toBeInstanceOf(AbortSignal));
    pendingView.stdin.write('\u001B');
    await vi.waitFor(() => expect(deps.onBack).toHaveBeenCalledOnce());
    expect(pageSignal?.aborted).toBe(true);
    resolvePage?.({ items: [{ ...playlist, name: 'Late result' }], nextToken: null });
    pendingView.unmount();

    const viewportDeps = dependencies();
    vi.mocked(viewportDeps.playlists.listPlaylistsPage).mockResolvedValue({
      items: Array.from({ length: 8 }, (_, index) => ({
        ...playlist,
        id: `playlist-${index}`,
        name: `Playlist ${index}`,
      })),
      nextToken: null,
    });
    const viewportView = renderPicker(viewportDeps, { availableRows: 8 });
    await vi.waitFor(() => expect(viewportView.lastFrame()).toContain('Playlist 0'));
    expect(viewportView.lastFrame()).toContain('↓ 7 more');
    expect(viewportView.lastFrame()).not.toContain('Playlist 7');
    viewportView.unmount();
  });
});
