import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { Track } from '../src/services/models.js';
import { SearchScreen, type SearchPlayer, type TuiSearch } from '../src/tui/search-screen.js';

const tracks: Track[] = Array.from({ length: 10 }, (_, index) => ({
  id: `track-${index + 1}`,
  uri: `spotify:track:${index + 1}`,
  name: `Result ${index + 1}`,
  artists: ['Artist'],
  album: 'Album',
  durationMs: 180_000,
}));

function dependencies(): { search: TuiSearch; player: SearchPlayer } {
  return {
    search: {
      searchTracks: vi.fn().mockResolvedValue(tracks),
      searchAlbums: vi.fn().mockResolvedValue([]),
      searchArtists: vi.fn().mockResolvedValue([]),
      searchPlaylists: vi.fn().mockResolvedValue([]),
    },
    player: {
      playTrack: vi.fn().mockResolvedValue(undefined),
      playContext: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('SearchScreen', () => {
  it('keeps results scrollable instead of clipping them in a short screen', async () => {
    const deps = dependencies();
    const view = render(
      <SearchScreen
        search={deps.search}
        player={deps.player}
        availableRows={10}
        onBack={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    view.stdin.write('n');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: n▌'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Result 1'));

    expect(view.lastFrame()).toContain('↓ 9 more');
    expect(view.lastFrame()).not.toContain('Result 2');

    view.stdin.write('\u001B[B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› Result 2'));
    expect(view.lastFrame()).toContain('↑ 1 more');
    view.unmount();
  });
});
