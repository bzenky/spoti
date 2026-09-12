import { z } from 'zod';

import { AppError, toError } from '../utils/errors.js';
import { sanitizeOneLineText } from '../utils/text.js';
import { VERSION } from '../version.js';
import type { Track } from './models.js';

const LRCLIB_BASE_URL = 'https://lrclib.net';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const MAX_AUTOMATIC_WAIT_SECONDS = 5;
const MAX_CACHE_ENTRIES = 50;

const lyricsResponseSchema = z.object({
  id: z.number().int().nonnegative(),
  trackName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  artistName: z.string().nullable(),
  albumName: z.string().nullable(),
  duration: z.number().nonnegative().nullable(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
});
const lyricsSearchResponseSchema = z.array(lyricsResponseSchema);

type LyricsResponse = z.infer<typeof lyricsResponseSchema>;
type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export class LyricsRateLimitedError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      `LRCLIB rate limit reached. Try again in ${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'second' : 'seconds'}.`,
    );
  }
}

export interface Lyrics {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  durationSeconds: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export class LyricsService {
  private readonly cache = new Map<string, Lyrics | null>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleeper: Sleep = abortableSleep,
    private readonly clientVersion = VERSION,
  ) {}

  async getLyrics(track: Track, signal?: AbortSignal): Promise<Lyrics | null> {
    const cacheKey = [track.name, track.artists.join(','), track.album, track.durationMs]
      .join('\u0000')
      .toLocaleLowerCase();
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    const exactResponse = await this.requestJson(createExactLookupUrl(track), signal);
    if (exactResponse !== null) {
      const exact = lyricsResponseSchema.safeParse(exactResponse);
      if (!exact.success) throw new AppError('LRCLIB returned an unexpected response. Try again later.');
      const lyrics = mapLyrics(exact.data, track);
      this.storeCacheEntry(cacheKey, lyrics);
      return lyrics;
    }

    const searchResponse = await this.requestJson(createSearchUrl(track), signal);
    if (searchResponse === null) {
      this.storeCacheEntry(cacheKey, null);
      return null;
    }
    const searched = lyricsSearchResponseSchema.safeParse(searchResponse);
    if (!searched.success) throw new AppError('LRCLIB returned an unexpected search response. Try again later.');
    const match = selectFallbackMatch(searched.data, track);
    const lyrics = match ? mapLyrics(match, track) : null;
    this.storeCacheEntry(cacheKey, lyrics);
    return lyrics;
  }

  private async requestJson(url: URL, signal?: AbortSignal): Promise<unknown | null> {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      const requestSignal = createRequestSignal(signal);
      try {
        const response = await this.fetcher(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': `@bzenky/spoti/${this.clientVersion} (https://github.com/bzenky/spoti)`,
          },
          signal: requestSignal.signal,
        });

        if (response.status === 404) return null;
        if (response.status === 429 || response.status === 503) {
          const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
          if (attempt < MAX_RETRIES && retryAfterSeconds <= MAX_AUTOMATIC_WAIT_SECONDS) {
            const delay = Math.max(retryAfterSeconds * 1_000, 500 * 2 ** attempt);
            requestSignal.cleanup();
            await this.sleeper(delay, signal);
            continue;
          }
          if (response.status === 429) throw new LyricsRateLimitedError(retryAfterSeconds);
          throw new AppError(
            `LRCLIB is temporarily unavailable. Try again in ${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'second' : 'seconds'}.`,
          );
        }
        if (!response.ok) {
          throw new AppError(`LRCLIB request failed with HTTP ${response.status}. Try again later.`);
        }
        return await response.json();
      } catch (error) {
        signal?.throwIfAborted();
        const normalized = toError(error);
        if (normalized.name === 'TimeoutError') {
          throw new AppError('LRCLIB did not respond within 10 seconds. Try again later.');
        }
        if (normalized instanceof AppError) throw normalized;
        throw new AppError(
          `Unable to reach LRCLIB: ${sanitizeOneLineText(normalized.message)}\n\nCheck your network connection and try again.`,
        );
      } finally {
        requestSignal.cleanup();
      }
    }
  }

  private storeCacheEntry(key: string, lyrics: Lyrics | null): void {
    if (!this.cache.has(key) && this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, lyrics);
  }
}

function createExactLookupUrl(track: Track): URL {
  const url = new URL('/api/get', LRCLIB_BASE_URL);
  url.search = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artists.join(', '),
    album_name: track.album,
    duration: String(track.durationMs / 1_000),
  }).toString();
  return url;
}

function createSearchUrl(track: Track): URL {
  const url = new URL('/api/search', LRCLIB_BASE_URL);
  url.search = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artists[0] ?? track.artists.join(', '),
    album_name: track.album,
  }).toString();
  return url;
}

function selectFallbackMatch(candidates: readonly LyricsResponse[], track: Track): LyricsResponse | null {
  const targetTitle = normalizeMatchText(track.name);
  const targetTitleBase = normalizeTitleBase(track.name);
  const targetArtist = normalizeMatchText(track.artists[0] ?? '');
  const targetAlbum = normalizeMatchText(track.album);
  const targetDuration = track.durationMs / 1_000;

  const scored = candidates.flatMap((candidate) => {
    const title = candidate.trackName ?? candidate.name ?? '';
    const normalizedTitle = normalizeMatchText(title);
    const titleMatches = normalizedTitle === targetTitle || normalizeTitleBase(title) === targetTitleBase;
    if (!titleMatches || !targetArtist) return [];

    const artist = normalizeMatchText(candidate.artistName ?? '');
    if (!artist || (!artist.includes(targetArtist) && !targetArtist.includes(artist))) return [];

    const albumMatches = normalizeMatchText(candidate.albumName ?? '') === targetAlbum;
    const durationDifference =
      candidate.duration === null ? Number.POSITIVE_INFINITY : Math.abs(candidate.duration - targetDuration);
    if (!albumMatches && !Number.isFinite(durationDifference)) return [];
    if (Number.isFinite(durationDifference) && durationDifference > 8) return [];

    const score =
      5 +
      (normalizedTitle === targetTitle ? 2 : 0) +
      3 +
      (albumMatches ? 3 : 0) +
      (durationDifference <= 2 ? 4 : durationDifference <= 5 ? 3 : durationDifference <= 8 ? 1 : 0);
    return [{ candidate, score, durationDifference }];
  });

  scored.sort(
    (left, right) =>
      right.score - left.score || left.durationDifference - right.durationDifference || left.candidate.id - right.candidate.id,
  );
  const best = scored[0];
  if (!best || best.score < 11) return null;
  const second = scored[1];
  if (
    second &&
    second.score === best.score &&
    Math.abs(second.durationDifference - best.durationDifference) < 0.5
  ) {
    return null;
  }
  return best.candidate;
}

function normalizeMatchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTitleBase(value: string): string {
  return normalizeMatchText(value)
    .replace(/\b(?:\d{4}\s+)?remaster(?:ed)?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapLyrics(result: LyricsResponse, track: Track): Lyrics {
  return {
    id: result.id,
    trackName: cleanMetadata(result.trackName ?? result.name, track.name),
    artistName: cleanMetadata(result.artistName, track.artists.join(', ')),
    albumName: cleanMetadata(result.albumName, track.album),
    durationSeconds: result.duration,
    instrumental: result.instrumental,
    plainLyrics: normalizeLyrics(result.plainLyrics),
    syncedLyrics: normalizeLyrics(result.syncedLyrics),
  };
}

interface RequestSignal {
  signal: AbortSignal;
  cleanup(): void;
}

function createRequestSignal(externalSignal?: AbortSignal): RequestSignal {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  if (externalSignal?.aborted) abortFromExternal();
  const timeout = setTimeout(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  );
  timeout.unref();
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

function parseRetryAfter(value: string | null): number {
  if (value === null) return 1;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : 1;
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  let abort: (() => void) | undefined;
  const waiting = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  return waiting.finally(() => {
    if (abort) signal?.removeEventListener('abort', abort);
  });
}

function cleanMetadata(value: string | null | undefined, fallback: string): string {
  return sanitizeOneLineText(value ?? '') || sanitizeOneLineText(fallback);
}

function normalizeLyrics(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}
