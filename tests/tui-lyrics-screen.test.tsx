import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { Lyrics } from '../src/services/lyrics.service.js';
import type { Track } from '../src/services/models.js';
import {
  LyricsScreen,
  parseSyncedLyrics,
  type LyricsScreenProps,
  type TuiLyrics,
} from '../src/tui/lyrics-screen.js';

const track: Track = {
  id: 'track-1',
  uri: 'spotify:track:track-1',
  name: 'Breaking the Habit',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 196_000,
};

function createLyrics(overrides: Partial<Lyrics> = {}): Lyrics {
  return {
    id: 1,
    trackName: track.name,
    artistName: track.artists[0] ?? '',
    albumName: track.album,
    durationSeconds: 196,
    instrumental: false,
    plainLyrics: null,
    syncedLyrics: null,
    ...overrides,
  };
}

function createService(result: Lyrics | null = null): TuiLyrics {
  return { getLyrics: vi.fn().mockResolvedValue(result) };
}

function renderScreen(service: TuiLyrics, overrides: Partial<LyricsScreenProps> = {}) {
  return render(
    <LyricsScreen
      lyrics={service}
      track={overrides.track === undefined ? track : overrides.track}
      progressMs={overrides.progressMs ?? 0}
      availableRows={overrides.availableRows ?? 14}
      onBack={overrides.onBack ?? vi.fn()}
      onExit={overrides.onExit ?? vi.fn()}
    />,
  );
}

describe('LyricsScreen', () => {
  it('loads lyrics once with the current track and an AbortSignal', async () => {
    let resolveLyrics: ((lyrics: Lyrics) => void) | undefined;
    const service = createService();
    vi.mocked(service.getLyrics).mockImplementation(
      async () => new Promise<Lyrics>((resolve) => { resolveLyrics = resolve; }),
    );
    const view = renderScreen(service);

    expect(view.lastFrame()).toContain('Loading lyrics from LRCLIB…');
    expect(service.getLyrics).toHaveBeenCalledOnce();
    expect(service.getLyrics).toHaveBeenCalledWith(track, expect.any(AbortSignal));
    resolveLyrics?.(createLyrics({ plainLyrics: 'I don’t know what’s worth fighting for' }));

    await vi.waitFor(() => expect(view.lastFrame()).toContain('I don’t know what’s worth fighting for'));
    expect(view.lastFrame()).toContain('Lyrics from LRCLIB: https://lrclib.net');
    view.unmount();
  });

  it('parses, sorts, sanitizes, and highlights synced lyrics at the current progress', async () => {
    const service = createService(createLyrics({
      plainLyrics: 'Plain fallback should not render',
      syncedLyrics: [
        '[ar:Unsafe metadata]ignored',
        '[00:04.5]\u001B[31mRepeated line',
        '[00:02.000][00:04.500]\u001B[31mRepeated line',
        '[00:03.00]Current\nline',
        '[00:99.00]invalid seconds',
      ].join('\n'),
    }));
    const view = renderScreen(service, { progressMs: 3_200 });

    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ Current'));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Repeated line');
    expect(frame).not.toContain('\u001B[31m');
    expect(frame).not.toContain('Plain fallback should not render');
    expect(frame).not.toContain('invalid seconds');
    view.unmount();
  });

  it('falls back to sanitized plain lyrics when synced lyrics have no valid timestamps', async () => {
    const service = createService(createLyrics({
      plainLyrics: 'First\u001B[31m line\nSecond\tline',
      syncedLyrics: '[ar:Artist]\n[bad]Not timed',
    }));
    const view = renderScreen(service);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('First line'));
    expect(view.lastFrame()).toContain('Second line');
    expect(view.lastFrame()).not.toContain('\u001B[31m');
    view.unmount();
  });

  it.each([
    [null, 'No lyrics found for this track.'],
    [createLyrics({ instrumental: true, plainLyrics: 'Should not render' }), 'This track is instrumental.'],
    [createLyrics(), 'No lyrics found for this track.'],
  ] as const)('renders the expected empty state', async (result, expected) => {
    const service = createService(result);
    const view = renderScreen(service);

    await vi.waitFor(() => expect(view.lastFrame()).toContain(expected));
    expect(view.lastFrame()).not.toContain('Should not render');
    view.unmount();
  });

  it('does not call LRCLIB without a track and shows an actionable message', () => {
    const service = createService();
    const view = renderScreen(service, { track: null });

    expect(view.lastFrame()).toContain('Start playback in Spotify, then return to Player and refresh.');
    expect(service.getLyrics).not.toHaveBeenCalled();
    expect(view.lastFrame()).toContain('Lyrics from LRCLIB: https://lrclib.net');
    view.unmount();
  });

  it('keeps sanitized errors visible and retries with r', async () => {
    const service = createService();
    vi.mocked(service.getLyrics)
      .mockRejectedValueOnce(new Error('LRCLIB failed\ntry again\u001B[31m'))
      .mockResolvedValueOnce(createLyrics({ plainLyrics: 'Recovered lyrics' }));
    const view = renderScreen(service);

    await vi.waitFor(() => expect(view.lastFrame()).toContain('LRCLIB failed try again'));
    expect(view.lastFrame()).toContain('Press Enter or [r] to retry.');
    expect(view.lastFrame()).not.toContain('LRCLIB failed\ntry again');
    view.stdin.write('r');

    await vi.waitFor(() => expect(service.getLyrics).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Recovered lyrics'));
    view.unmount();
  });

  it('supports manual scrolling and f to resume following synced lyrics', async () => {
    const syncedLyrics = Array.from(
      { length: 8 },
      (_, index) => `[00:0${index}.00]Line ${index}`,
    ).join('\n');
    const service = createService(createLyrics({ syncedLyrics }));
    const view = renderScreen(service, { progressMs: 6_200, availableRows: 10 });

    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ Line 6'));
    view.stdin.write('\u001B[A');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('Line 5'));
    expect(view.lastFrame()).toContain('Resume follow');
    expect(view.lastFrame()).not.toContain('▶ Line 6');

    view.stdin.write('f');
    await vi.waitFor(() => expect(view.lastFrame()).toContain('▶ Line 6'));
    expect(view.lastFrame()).toContain('[f] Following');
    view.unmount();
  });

  it('aborts an in-flight request before going back', async () => {
    let signal: AbortSignal | undefined;
    const service = createService();
    vi.mocked(service.getLyrics).mockImplementation(
      async (_track, requestSignal) => new Promise<Lyrics | null>((resolve) => {
        signal = requestSignal;
        requestSignal?.addEventListener('abort', () => resolve(null), { once: true });
      }),
    );
    const onBack = vi.fn();
    const view = renderScreen(service, { onBack });
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));

    view.stdin.write('\u001B');

    await vi.waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(signal?.aborted).toBe(true);
    view.unmount();
  });

  it('supports Ctrl+X exit and aborts pending work', async () => {
    let signal: AbortSignal | undefined;
    const service = createService();
    vi.mocked(service.getLyrics).mockImplementation(
      async (_track, requestSignal) => new Promise<Lyrics | null>((resolve) => {
        signal = requestSignal;
        requestSignal?.addEventListener('abort', () => resolve(null), { once: true });
      }),
    );
    const onExit = vi.fn();
    const view = renderScreen(service, { onExit });
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));

    view.stdin.write('\u0018');

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledOnce());
    expect(signal?.aborted).toBe(true);
    view.unmount();
  });

  it('aborts an in-flight request on unmount', async () => {
    let signal: AbortSignal | undefined;
    const service = createService();
    vi.mocked(service.getLyrics).mockImplementation(
      async (_track, requestSignal) => new Promise<Lyrics | null>((resolve) => {
        signal = requestSignal;
        requestSignal?.addEventListener('abort', () => resolve(null), { once: true });
      }),
    );
    const view = renderScreen(service);
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});

describe('parseSyncedLyrics', () => {
  it('accepts common timestamp precision and repeated timestamps while rejecting malformed lines', () => {
    expect(parseSyncedLyrics([
      '[1:02]Whole seconds',
      '[00:01.5]Tenths',
      '[00:01.25]Hundredths',
      '[00:01.250][00:03.000]Repeated',
      '[00:60.00]Bad seconds',
      '[offset:100]Metadata',
      'No timestamp',
    ].join('\n'))).toEqual([
      { text: 'Tenths', timestampMs: 1_500 },
      { text: 'Hundredths', timestampMs: 1_250 },
      { text: 'Repeated', timestampMs: 1_250 },
      { text: 'Repeated', timestampMs: 3_000 },
      { text: 'Whole seconds', timestampMs: 62_000 },
    ].sort((left, right) => left.timestampMs - right.timestampMs));
  });
});
