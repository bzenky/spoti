import { describe, expect, it, vi } from 'vitest';

import {
  LyricsRateLimitedError,
  LyricsService,
} from '../src/services/lyrics.service.js';
import type { Track } from '../src/services/models.js';


const track: Track = {
  id: 'track-1',
  uri: 'spotify:track:track-1',
  name: 'Numb',
  artists: ['Linkin Park'],
  album: 'Meteora',
  durationMs: 185_250,
};

function lyricsResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    trackName: 'Numb',
    artistName: 'Linkin Park',
    albumName: 'Meteora',
    duration: 185.25,
    instrumental: false,
    plainLyrics: 'I have become so numb',
    syncedLyrics: '[00:01.00]I have become so numb',
    ...overrides,
  };
}

describe('LyricsService', () => {
  it('looks up exact track metadata and identifies spoti to LRCLIB', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(lyricsResponse()));
    const service = new LyricsService(fetcher, vi.fn(), '0.8.0-test');

    await expect(service.getLyrics(track)).resolves.toMatchObject({
      id: 123,
      trackName: 'Numb',
      plainLyrics: 'I have become so numb',
    });

    const [request, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(request));
    expect(url.origin).toBe('https://lrclib.net');
    expect(url.pathname).toBe('/api/get');
    expect(url.searchParams.get('track_name')).toBe('Numb');
    expect(url.searchParams.get('artist_name')).toBe('Linkin Park');
    expect(url.searchParams.get('album_name')).toBe('Meteora');
    expect(url.searchParams.get('duration')).toBe('185.25');
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      '@bzenky/spoti/0.8.0-test (https://github.com/bzenky/spoti)',
    );
  });

  it('caches resolved lyrics only for the running service instance', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(lyricsResponse()));
    const service = new LyricsService(fetcher);

    await service.getLyrics(track);
    await service.getLyrics({ ...track });

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('treats a 404 as unavailable lyrics and preserves instrumental results', async () => {
    const missing = new LyricsService(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 404 })),
    );
    await expect(missing.getLyrics(track)).resolves.toBeNull();

    const instrumental = new LyricsService(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(lyricsResponse({ instrumental: true, plainLyrics: null, syncedLyrics: null })),
      ),
    );
    await expect(instrumental.getLyrics(track)).resolves.toMatchObject({ instrumental: true });
  });

  it('uses a strongly matching LRCLIB search result after exact lookup misses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json([
          lyricsResponse({
            id: 456,
            trackName: 'Numb - 2003 Remastered',
            albumName: 'Meteora (20th Anniversary Edition)',
            duration: 185.8,
          }),
        ]),
      );

    await expect(new LyricsService(fetcher).getLyrics(track)).resolves.toMatchObject({ id: 456 });
    const searchUrl = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(searchUrl.pathname).toBe('/api/search');
    expect(searchUrl.searchParams.get('track_name')).toBe('Numb');
    expect(searchUrl.searchParams.get('artist_name')).toBe('Linkin Park');
  });

  it('rejects weak or ambiguous fallback matches instead of showing incorrect lyrics', async () => {
    const wrongVersionFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json([
          lyricsResponse({ id: 1, trackName: 'Numb Live', duration: 220 }),
          lyricsResponse({ id: 2, trackName: 'Another Song', duration: 185 }),
        ]),
      );
    await expect(new LyricsService(wrongVersionFetcher).getLyrics(track)).resolves.toBeNull();

    const ambiguousFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 404 }))
      .mockResolvedValueOnce(
        Response.json([
          lyricsResponse({ id: 1, duration: 185.1 }),
          lyricsResponse({ id: 2, duration: 185.2 }),
        ]),
      );
    await expect(new LyricsService(ambiguousFetcher).getLyrics(track)).resolves.toBeNull();
  });

  it('retries bounded 429 and 503 responses using Retry-After', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({}, { status: 503, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(
        Response.json({}, { status: 429, headers: { 'retry-after': '2' } }),
      )
      .mockResolvedValueOnce(Response.json(lyricsResponse()));
    const sleeper = vi.fn().mockResolvedValue(undefined);

    await expect(new LyricsService(fetcher, sleeper).getLyrics(track)).resolves.toMatchObject({
      id: 123,
    });
    expect(sleeper).toHaveBeenNthCalledWith(1, 1_000, undefined);
    expect(sleeper).toHaveBeenNthCalledWith(2, 2_000, undefined);
  });

  it('does not wait through long rate limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({}, { status: 429, headers: { 'retry-after': '3600' } }),
    );
    const sleeper = vi.fn().mockResolvedValue(undefined);

    await expect(new LyricsService(fetcher, sleeper).getLyrics(track)).rejects.toBeInstanceOf(
      LyricsRateLimitedError,
    );
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('rejects malformed responses without exposing unvalidated data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ id: 'wrong', plainLyrics: '\u001B[31msecret' }),
    );

    await expect(new LyricsService(fetcher).getLyrics(track)).rejects.toThrow(
      'unexpected response',
    );
  });

  it('propagates external cancellation', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
      });
    });
    const request = new LyricsService(fetcher).getLyrics(track, controller.signal);
    await vi.waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));

    controller.abort();

    await expect(request).rejects.toBe(controller.signal.reason);
  });
});
