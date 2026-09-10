import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { Track } from '../src/services/models.js';
import type { PlaybackQueue } from '../src/services/queue.service.js';
import {
  QueueScreen,
  type QueueScreenProps,
  type TuiQueue,
  type TuiQueueSearch,
} from '../src/tui/queue-screen.js';

const loadedQueue: PlaybackQueue = {
  currentlyPlaying: {
    name: 'Current\nSong',
    uri: 'spotify:track:current',
    type: 'track',
    subtitle: 'Artist\u001B[31m Name',
    durationMs: 181_000,
  },
  queue: [
    {
      name: 'Next Song',
      uri: 'spotify:track:next',
      type: 'track',
      subtitle: 'Next Artist',
      durationMs: 242_000,
    },
  ],
};

const tracks: Track[] = [
  {
    id: 'first',
    uri: 'spotify:track:first',
    name: 'First Result',
    artists: ['First Artist'],
    album: 'First Album',
    durationMs: 180_000,
  },
  {
    id: 'second',
    uri: 'spotify:track:second',
    name: 'Second\nResult',
    artists: ['Second\u001B[31m Artist'],
    album: 'Second Album',
    durationMs: 200_000,
  },
];

function createDependencies(playbackQueue: PlaybackQueue = loadedQueue): {
  queue: TuiQueue;
  search: TuiQueueSearch;
} {
  return {
    queue: {
      getQueue: vi.fn().mockResolvedValue(playbackQueue),
      addItem: vi.fn().mockResolvedValue(undefined),
    },
    search: {
      searchTracks: vi.fn().mockResolvedValue([]),
    },
  };
}

function renderQueue(overrides: Partial<QueueScreenProps> = {}) {
  const dependencies = createDependencies();
  const props: QueueScreenProps = {
    ...dependencies,
    onBack: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  return { view: render(<QueueScreen {...props} />), props };
}

describe('QueueScreen', () => {
  it('loads lazily on mount and renders terminal-safe current and upcoming tracks', async () => {
    let resolveQueue: ((value: PlaybackQueue) => void) | undefined;
    const getQueue = vi.fn(
      async () =>
        new Promise<PlaybackQueue>((resolve) => {
          resolveQueue = resolve;
        }),
    );
    const { view } = renderQueue({ queue: { getQueue, addItem: vi.fn() } });

    expect(view.lastFrame()).toContain('Loading queue…');
    await vi.waitFor(() => expect(getQueue).toHaveBeenCalledOnce());
    resolveQueue?.(loadedQueue);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Current Song'));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Now playing');
    expect(frame).toContain('Current Song — Artist Name · 3:01');
    expect(frame).toContain('Upcoming');
    expect(frame).toContain('1. Next Song — Next Artist · 4:02');
    expect(frame).not.toContain('\u001B[31m Name');
    view.unmount();
  });

  it('shows empty and error states and permits manual refresh', async () => {
    const emptyQueue: PlaybackQueue = { currentlyPlaying: null, queue: [] };
    const queue: TuiQueue = {
      getQueue: vi
        .fn()
        .mockRejectedValueOnce(new Error('Spotify unavailable\nretry'))
        .mockResolvedValueOnce(emptyQueue),
      addItem: vi.fn(),
    };
    const { view } = renderQueue({ queue });

    await vi.waitFor(() => expect(view.lastFrame()).toContain('Spotify unavailable retry'));
    view.stdin.write('r');

    await vi.waitFor(() => expect(queue.getQueue).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('The queue is empty.'));
    expect(view.lastFrame()).not.toContain('Spotify unavailable retry');
    view.unmount();
  });

  it('searches, selects, and adds a track with an optimistic queue update', async () => {
    const { queue, search } = createDependencies();
    vi.mocked(search.searchTracks).mockResolvedValue(tracks);
    const { view } = renderQueue({ queue, search });
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Next Song'));

    view.stdin.write('a');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Add track to queue'));
    view.stdin.write('query');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: query'));
    view.stdin.write('\r');

    await vi.waitFor(() => {
      expect(search.searchTracks).toHaveBeenCalledWith('query', 10, expect.any(AbortSignal));
      expect(view.lastFrame()).toContain('Second Result — Second Artist');
    });
    view.stdin.write('\u001B[B');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('› Second Result'));
    view.stdin.write('\r');

    await vi.waitFor(() =>
      expect(queue.addItem).toHaveBeenCalledWith(
        'spotify:track:second',
        expect.any(AbortSignal),
      ),
    );
    expect(queue.getQueue).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(view.lastFrame()).toContain('2. Second Result — Second Artist');
      expect(view.lastFrame()).toContain('Added Second Result — Second Artist to the queue.');
    });
    view.unmount();
  });

  it('aborts an active search when the add flow is cancelled', async () => {
    let signal: AbortSignal | undefined;
    const search: TuiQueueSearch = {
      searchTracks: vi.fn(
        async (_query, _limit, requestSignal) =>
          new Promise<Track[]>((resolve) => {
            signal = requestSignal;
            requestSignal?.addEventListener('abort', () => resolve([]), { once: true });
          }),
      ),
    };
    const onBack = vi.fn();
    const { view } = renderQueue({ search, onBack });
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Next Song'));

    view.stdin.write('a');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Add track to queue'));
    view.stdin.write('pending');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Search: pending'));
    view.stdin.write('\r');
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    expect(view.lastFrame()).toContain('Playback queue');
    expect(onBack).not.toHaveBeenCalled();
    view.stdin.write('\u001B');
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    view.unmount();
  });

  it('aborts active search work on exit and unmount', async () => {
    const signals: AbortSignal[] = [];
    const search: TuiQueueSearch = {
      searchTracks: vi.fn(
        async (_query, _limit, signal) =>
          new Promise<Track[]>((resolve) => {
            if (signal) signals.push(signal);
            signal?.addEventListener('abort', () => resolve([]), { once: true });
          }),
      ),
    };
    const onExit = vi.fn();
    const first = renderQueue({ search, onExit });
    await vi.waitFor(() => expect(first.view.lastFrame()).toContain('Next Song'));
    first.view.stdin.write('a');
    await vi.waitFor(() => expect(first.view.lastFrame()).toContain('Add track to queue'));
    first.view.stdin.write('exit');
    await vi.waitFor(() => expect(first.view.lastFrame()).toContain('Search: exit'));
    first.view.stdin.write('\r');
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    first.view.stdin.write('\u0018');

    expect(signals[0]?.aborted).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
    first.view.unmount();

    const second = renderQueue({ search });
    await vi.waitFor(() => expect(second.view.lastFrame()).toContain('Next Song'));
    second.view.stdin.write('a');
    await vi.waitFor(() => expect(second.view.lastFrame()).toContain('Add track to queue'));
    second.view.stdin.write('unmount');
    await vi.waitFor(() => expect(second.view.lastFrame()).toContain('Search: unmount'));
    second.view.stdin.write('\r');
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    second.view.unmount();

    expect(signals[1]?.aborted).toBe(true);
  });
});
