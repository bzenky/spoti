import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '../src/services/models.js';
import { LibraryScreen, type LibraryScreenProps } from '../src/tui/library-screen.js';

const track: Track = { id: 'numb', uri: 'spotify:track:numb', name: 'Numb', artists: ['Linkin Park'], album: 'Meteora', durationMs: 185000 };
const faint = { ...track, id: 'faint', uri: 'spotify:track:faint', name: 'Faint', albumUri: 'spotify:album:meteora' };
const playlist = { id: 'workout', uri: 'spotify:playlist:workout', name: 'Workout', ownerName: 'Me', ownerId: 'me', totalTracks: 100 };
const page = (tracks: Track[], offset: number | null = null) => ({ items: tracks, nextToken: offset === null ? null : { offset } });
function deps() {
  return {
    playlists: { listPlaylistsPage: vi.fn().mockResolvedValue({ items: [playlist], nextToken: null }), getPlaylistItemsPage: vi.fn().mockResolvedValue(page([track])), updatePlaylistDetails: vi.fn(), moveItem: vi.fn() },
    auth: { getCurrentUser: vi.fn().mockResolvedValue({ id: 'me' }) },
    library: { getLikedTracksPage: vi.fn(), getTopTracksPage: vi.fn(), getTopArtistsPage: vi.fn() },
    recent: { getRecentlyPlayedPage: vi.fn() },
    player: { playTrack: vi.fn().mockResolvedValue(undefined), playContext: vi.fn() },
    onBack: vi.fn(), onExit: vi.fn(), sessionCache: new Map(), availableRows: 20,
  } satisfies LibraryScreenProps;
}
async function opened(props = deps()) {
  const view = render(<LibraryScreen {...props} />);
  await vi.waitFor(() => expect(view.lastFrame()).toContain('Workout'));
  view.stdin.write('\r');
  await vi.waitFor(() => expect(view.lastFrame()).toContain('Numb — Linkin Park'));
  return { view, props };
}
const frame = (view: ReturnType<typeof render>) => view.lastFrame() ?? '';

describe('playlist filtering', () => {
  it('loads the whole playlist progressively without restarting for query changes', async () => {
    const props = deps();
    let finish!: (value: ReturnType<typeof page>) => void;
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { view } = await opened(props);
    try {
      view.stdin.write('/');
      await vi.waitFor(() => expect(frame(view)).toContain('Loading playlist…'));
      expect(frame(view)).toContain('1 tracks loaded');
      expect(frame(view)).toContain('Numb — Linkin Park');
      view.stdin.write('faint');
      await vi.waitFor(() => expect(frame(view)).toContain('Filter: faint'));
      expect(frame(view)).not.toContain('Numb — Linkin Park');
      finish(page([faint]));
      await vi.waitFor(() => expect(frame(view)).toContain('Faint — Linkin Park'));
      expect(frame(view)).toContain('2 tracks loaded');
      expect(frame(view)).not.toContain('Loading playlist…');
      expect(props.playlists.getPlaylistItemsPage).toHaveBeenCalledTimes(2);
      expect(props.playlists.getPlaylistItemsPage).toHaveBeenLastCalledWith('workout', { offset: 50 }, 50, expect.any(AbortSignal));
    } finally { view.unmount(); }
  });

  it('preserves order and duplicate matches', async () => {
    const props = deps();
    props.playlists.getPlaylistItemsPage.mockResolvedValue(page([track, faint, track]));
    const { view } = await opened(props);
    try {
      view.stdin.write('/'); view.stdin.write('linkin');
      await vi.waitFor(() => expect(frame(view)).toContain('3 matches'));
      const rows = frame(view).split('\n').filter(line => /[› ] (Numb|Faint) —/.test(line));
      expect(rows.map(line => line.replace(/^[› ]+/, ''))).toEqual([
        'Numb — Linkin Park', 'Faint — Linkin Park', 'Numb — Linkin Park',
      ]);
    } finally { view.unmount(); }
  });

  it('treats shortcut letters as text and removes a whole grapheme', async () => {
    const { view, props } = await opened();
    try {
      view.stdin.write('/');
      await vi.waitFor(() => expect(frame(view)).toContain('Filter:'));
      view.stdin.write('npe');
      await vi.waitFor(() => expect(frame(view)).toContain('Filter: npe'));
      view.stdin.write('👩‍💻');
      await vi.waitFor(() => expect(frame(view)).toContain('👩‍💻'));
      view.stdin.write('\u007f');
      await vi.waitFor(() => expect(frame(view)).not.toContain('👩‍💻'));
      expect(frame(view)).toContain('Filter: npe');
      expect(props.playlists.getPlaylistItemsPage).toHaveBeenCalledOnce();
      expect(props.auth.getCurrentUser).not.toHaveBeenCalled();
      expect(props.playlists.moveItem).not.toHaveBeenCalled();
      expect(props.playlists.updatePlaylistDetails).not.toHaveBeenCalled();
      view.stdin.write('\u001b');
      await vi.waitFor(() => expect(frame(view)).not.toContain('Filter:'));
      view.stdin.write('e');
      await vi.waitFor(() => expect(frame(view)).toContain('Edit playlist'));
    } finally { view.unmount(); }
  });

  it('plays the selected match with album context and keeps the filter', async () => {
    const props = deps();
    let finish!: (value: ReturnType<typeof page>) => void;
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track, faint], 50)).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { view } = await opened(props);
    try {
      view.stdin.write('/'); view.stdin.write('linkin');
      await vi.waitFor(() => expect(frame(view)).toContain('Filter: linkin'));
      view.stdin.write('\u001b[B');
      await vi.waitFor(() => expect(frame(view)).toContain('› Faint'));
      view.stdin.write('\u001b[A');
      await vi.waitFor(() => expect(frame(view)).toContain('› Numb'));
      view.stdin.write('\u001b[A');
      await vi.waitFor(() => expect(frame(view)).toContain('› Faint'));
      view.stdin.write('\r');
      await vi.waitFor(() => expect(props.player.playTrack).toHaveBeenCalledWith(faint.uri, expect.any(AbortSignal), faint.albumUri));
      await vi.waitFor(() => expect(frame(view)).toContain('▶ Playing Faint'));
      expect(frame(view)).toContain('Filter: linkin');
      expect(frame(view)).toContain('› Faint');
      expect(props.player.playTrack).toHaveBeenCalledOnce();
      const signal = props.playlists.getPlaylistItemsPage.mock.calls[1]?.[3] as AbortSignal;
      expect(signal.aborted).toBe(false);
      finish(page([{ ...track, name: 'Later match' }]));
      await vi.waitFor(() => expect(frame(view)).toContain('Later match'));
      expect(frame(view)).toContain('3 matches');
    } finally { view.unmount(); }
  });

  it('restores the original page and selection on Escape', async () => {
    const props = deps();
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockResolvedValueOnce(page([faint, { ...track, name: 'Original selection' }]));
    const { view } = await opened(props);
    try {
      view.stdin.write('n');
      await vi.waitFor(() => expect(frame(view)).toContain('Page 2'));
      view.stdin.write('\u001b[B');
      await vi.waitFor(() => expect(frame(view)).toContain('› Original selection'));
      view.stdin.write('/'); view.stdin.write('numb');
      await vi.waitFor(() => expect(frame(view)).toContain('› Numb'));
      view.stdin.write('\u001b');
      await vi.waitFor(() => expect(frame(view)).toContain('Page 2'));
      expect(frame(view)).toContain('› Original selection');
      expect(frame(view)).not.toContain('Filter:');
      view.stdin.write('\r');
      await vi.waitFor(() => expect(props.player.playTrack).toHaveBeenCalledWith(track.uri, expect.any(AbortSignal)));
      view.stdin.write('\u001b');
      await vi.waitFor(() => expect(frame(view)).toContain('Playlists  Liked  Recent'));
      expect(props.onBack).not.toHaveBeenCalled();
    } finally { view.unmount(); }
  });

  it('aborts filtering and ignores late pages on exit', async () => {
    for (const exit of ['escape', 'ctrl-x', 'unmount']) {
      const props = deps();
      let finish!: (value: ReturnType<typeof page>) => void;
      props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
      const { view } = await opened(props);
      try {
        view.stdin.write('/');
        await vi.waitFor(() => expect(props.playlists.getPlaylistItemsPage).toHaveBeenCalledTimes(2));
        const signal = props.playlists.getPlaylistItemsPage.mock.calls[1]?.[3] as AbortSignal;
        if (exit === 'unmount') view.unmount();
        else view.stdin.write(exit === 'escape' ? '\u001b' : '\u0018');
        await vi.waitFor(() => expect(signal.aborted).toBe(true));
        finish(page([faint]));
        await new Promise(resolve => setTimeout(resolve, 30));
        const cached = props.sessionCache.get('playlist:workout');
        expect(cached.pages).toHaveLength(1);
        if (exit === 'escape') expect(frame(view)).not.toContain('Faint');
        if (exit === 'ctrl-x') expect(props.onExit).toHaveBeenCalledOnce();
      } finally { view.unmount(); }
    }
  });

  it('distinguishes searching from no matches and never plays an empty result', async () => {
    const props = deps();
    let finish!: (value: ReturnType<typeof page>) => void;
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { view } = await opened(props);
    try {
      view.stdin.write('/'); view.stdin.write('absent');
      await vi.waitFor(() => expect(frame(view)).toContain('Searching playlist…'));
      expect(frame(view)).not.toContain('No matching tracks.');
      view.stdin.write('\r');
      finish(page([]));
      await vi.waitFor(() => expect(frame(view)).toContain('No matching tracks.'));
      view.stdin.write('\r');
      expect(props.player.playTrack).not.toHaveBeenCalled();
    } finally { view.unmount(); }
    const emptyProps = deps();
    emptyProps.playlists.getPlaylistItemsPage.mockResolvedValue(page([]));
    const empty = render(<LibraryScreen {...emptyProps} />);
    try {
      await vi.waitFor(() => expect(frame(empty)).toContain('Workout'));
      empty.stdin.write('\r');
      await vi.waitFor(() => expect(frame(empty)).toContain('No playlist tracks found.'));
      empty.stdin.write('/');
      await vi.waitFor(() => expect(frame(empty)).toContain('No matching tracks.'));
      expect(frame(empty)).toContain('0 tracks loaded');
    } finally { empty.unmount(); }
  });

  it('retries failed pages while preserving cached matches and query', async () => {
    const props = deps();
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockRejectedValueOnce(new Error('rate limit\nretry later')).mockResolvedValueOnce(page([faint]));
    const { view } = await opened(props);
    try {
      view.stdin.write('/'); view.stdin.write('linkin');
      await vi.waitFor(() => expect(frame(view)).toContain('rate limit retry later'));
      expect(frame(view)).toContain('Numb — Linkin Park');
      expect(frame(view)).toContain('Ctrl+R');
      view.stdin.write('\u0012');
      await vi.waitFor(() => expect(frame(view)).toContain('Faint — Linkin Park'));
      expect(frame(view)).toContain('Filter: linkin');
      expect(props.playlists.getPlaylistItemsPage.mock.calls.map(call => call[1])).toEqual([undefined, { offset: 50 }, { offset: 50 }]);
    } finally { view.unmount(); }
  });

  it('reuses session pages when filtering is reopened', async () => {
    const props = deps();
    props.playlists.getPlaylistItemsPage.mockResolvedValueOnce(page([track], 50)).mockResolvedValueOnce(page([faint]));
    const { view } = await opened(props);
    try {
      view.stdin.write('/'); view.stdin.write('faint');
      await vi.waitFor(() => expect(frame(view)).toContain('Faint — Linkin Park'));
      view.stdin.write('\u001b');
      await vi.waitFor(() => expect(frame(view)).not.toContain('Filter:'));
      view.stdin.write('/');
      await vi.waitFor(() => {
        expect(frame(view)).toContain('Filter:');
        expect(frame(view)).toContain('Numb — Linkin Park');
        expect(frame(view)).toContain('Faint — Linkin Park');
      });
      expect(frame(view)).not.toContain('Filter: faint');
      expect(props.playlists.getPlaylistItemsPage).toHaveBeenCalledTimes(2);
    } finally { view.unmount(); }
  });
});
