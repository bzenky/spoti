import { describe, expect, it, vi } from 'vitest';

import { createProgram } from '../src/app.js';
import type { AuthService } from '../src/services/auth.service.js';
import type { PlayerService } from '../src/services/player.service.js';
import type { SearchService } from '../src/services/search.service.js';
import type { Track } from '../src/services/models.js';

const track: Track = {
  id: '1',
  uri: 'spotify:track:1',
  name: 'Numb',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 185_000,
};

function dependencies() {
  const messages: string[] = [];
  return {
    messages,
    auth: {
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: vi.fn(),
      getCurrentUser: vi.fn(),
      getAccessToken: vi.fn(),
    } as unknown as AuthService,
    player: {
      playTrack: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      next: vi.fn(),
      previous: vi.fn(),
      getCurrentPlayback: vi.fn(),
    } as unknown as PlayerService,
    search: { searchTracks: vi.fn() } as unknown as SearchService,
    output: { log: (message: string) => messages.push(message), error: vi.fn() },
    chooseTrack: vi.fn(),
  };
}

async function run(args: string[], deps: ReturnType<typeof dependencies>): Promise<void> {
  await createProgram(deps).exitOverride().parseAsync(['node', 'spoti', ...args]);
}

describe('CLI application', () => {
  it('plays the interactively selected result', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchTracks).mockResolvedValue([track]);
    deps.chooseTrack.mockResolvedValue(track);

    await run(['play', 'Numb'], deps);

    expect(deps.player.playTrack).toHaveBeenCalledWith(track.uri);
    expect(deps.messages).toContain('▶ Playing Numb — Linkin Park');
  });

  it('resumes playback when play has no query', async () => {
    const deps = dependencies();
    await run(['play'], deps);
    expect(deps.player.resume).toHaveBeenCalledOnce();
  });

  it('rejects malformed search limits', async () => {
    const deps = dependencies();
    await expect(run(['search', 'Numb', '--limit', '5junk'], deps)).rejects.toThrow(
      'Search limit must be an integer between 1 and 10.',
    );
    expect(deps.search.searchTracks).not.toHaveBeenCalled();
  });

  it('reports an empty search without attempting playback', async () => {
    const deps = dependencies();
    vi.mocked(deps.search.searchTracks).mockResolvedValue([]);
    await run(['play', 'missing'], deps);
    expect(deps.player.playTrack).not.toHaveBeenCalled();
    expect(deps.messages).toEqual(['No tracks found for "missing".']);
  });
});
