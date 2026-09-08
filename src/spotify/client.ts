import {
  AppError,
  AuthenticationRequiredError,
  NoActiveDeviceError,
  PremiumRequiredError,
  RateLimitedError,
  SpotifyApiError,
  toError,
} from '../utils/errors.js';
import { sanitizeOneLineText } from '../utils/text.js';
import type { SpotifyErrorBody } from './types.js';

const API_BASE_URL = 'https://api.spotify.com/v1';
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS = 5;
const PLAYBACK_CONTROL_REQUESTS = new Set([
  'PUT /me/player',
  'PUT /me/player/play',
  'PUT /me/player/pause',
  'POST /me/player/next',
  'POST /me/player/previous',
  'PUT /me/player/seek',
  'PUT /me/player/repeat',
  'PUT /me/player/volume',
  'PUT /me/player/shuffle',
  'POST /me/player/queue',
]);

type Sleep = (milliseconds: number) => Promise<void>;

const sleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface SpotifyApi {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, options?: RequestOptions): Promise<T>;
  put<T>(path: string, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  forceRefreshAccessToken(): Promise<string>;
}

export class SpotifyClient implements SpotifyApi {
  constructor(
    private readonly authService: AccessTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
    private readonly sleeper: Sleep = sleep,
  ) {}

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = new Headers();
    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }

    throwIfExternallyAborted(options.signal);
    let accessToken = await this.authService.getAccessToken();
    let refreshedToken = false;
    let rateLimitRetries = 0;

    while (true) {
      throwIfExternallyAborted(options.signal);
      headers.set('Authorization', `Bearer ${accessToken}`);
      const attempt = createAttemptSignal(options.signal);
      let shouldRefreshToken = false;
      let retryDelayMs: number | undefined;

      try {
        const response = await this.fetcher(url, {
          method,
          headers,
          signal: attempt.signal,
          ...(body === undefined ? {} : { body }),
        });

        if (response.status === 401 && !refreshedToken) {
          shouldRefreshToken = true;
        } else if (
          response.status === 429 &&
          rateLimitRetries < MAX_RATE_LIMIT_RETRIES &&
          getRetryAfterSeconds(response) <= MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS
        ) {
          const retryAfterSeconds = getRetryAfterSeconds(response);
          const exponentialBackoffMs = 500 * 2 ** rateLimitRetries;
          rateLimitRetries += 1;
          retryDelayMs = Math.max(retryAfterSeconds * 1_000, exponentialBackoffMs);
        } else {
          if (!response.ok) {
            const mappedError = await mapSpotifyError(response, method, path);
            throwIfAttemptAborted(attempt.signal, options.signal);
            throw mappedError;
          }
          if (response.status === 204) return undefined as T;

          const text = await response.text();
          throwIfAttemptAborted(attempt.signal, options.signal);
          if (!text) return undefined as T;

          const contentType = response.headers.get('content-type')?.toLocaleLowerCase() ?? '';
          if (!contentType.includes('json')) {
            if (method !== 'GET') return undefined as T;
            throw new SpotifyApiError(
              'Spotify returned an unexpected non-JSON response. Try again.',
              response.status,
            );
          }

          try {
            return JSON.parse(text) as T;
          } catch {
            throw new SpotifyApiError(
              'Spotify returned malformed JSON. Try again.',
              response.status,
            );
          }
        }
      } catch (error) {
        throw normalizeAttemptError(error, attempt.signal, options.signal);
      } finally {
        attempt.cleanup();
      }

      if (shouldRefreshToken) {
        throwIfExternallyAborted(options.signal);
        accessToken = await this.authService.forceRefreshAccessToken();
        refreshedToken = true;
        continue;
      }

      if (retryDelayMs !== undefined) {
        await this.waitForRetry(retryDelayMs, options.signal);
        continue;
      }
    }
  }

  private async waitForRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
    throwIfExternallyAborted(signal);
    if (!signal) {
      await this.sleeper(milliseconds);
      return;
    }

    if (this.sleeper === sleep) {
      await abortableSleep(milliseconds, signal);
      return;
    }

    let abortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(getExternalAbortReason(signal));
      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) abortListener();
    });
    try {
      await Promise.race([this.sleeper(milliseconds), aborted]);
    } finally {
      if (abortListener) signal.removeEventListener('abort', abortListener);
    }
  }
}

interface AttemptSignal {
  signal: AbortSignal;
  cleanup(): void;
}

function createAttemptSignal(externalSignal?: AbortSignal): AttemptSignal {
  const controller = new AbortController();
  const abortFromExternalSignal = () => {
    if (externalSignal) controller.abort(getExternalAbortReason(externalSignal));
  };
  externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  if (externalSignal?.aborted) abortFromExternalSignal();

  const timeout = setTimeout(
    () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')),
    15_000,
  );
  timeout.unref();

  let cleanedUp = false;
  return {
    signal: controller.signal,
    cleanup: () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    },
  };
}

function normalizeAttemptError(
  error: unknown,
  attemptSignal: AbortSignal,
  externalSignal?: AbortSignal,
): Error {
  if (externalSignal?.aborted) return getExternalAbortReason(externalSignal);

  const normalizedError = toError(error);
  if (
    normalizedError.name === 'TimeoutError' ||
    (attemptSignal.aborted && toError(attemptSignal.reason).name === 'TimeoutError')
  ) {
    return new AppError('Spotify did not respond within 15 seconds. Try again.');
  }
  if (normalizedError instanceof AppError) return normalizedError;
  return new AppError(
    `Unable to reach Spotify: ${sanitizeOneLineText(normalizedError.message)}\n\nCheck your network connection and try again.`,
  );
}

function throwIfAttemptAborted(
  attemptSignal: AbortSignal,
  externalSignal?: AbortSignal,
): void {
  throwIfExternallyAborted(externalSignal);
  if (attemptSignal.aborted) throw attemptSignal.reason;
}

function throwIfExternallyAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw getExternalAbortReason(signal);
}

function getExternalAbortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  return new DOMException('The operation was aborted.', 'AbortError');
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abortListener);
      resolve();
    }, milliseconds);
    const abortListener = () => {
      clearTimeout(timer);
      reject(getExternalAbortReason(signal));
    };
    signal.addEventListener('abort', abortListener, { once: true });
    if (signal.aborted) abortListener();
  });
}

function getRetryAfterSeconds(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header === null) return 1;

  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return 1;
  return Math.ceil(seconds);
}

async function mapSpotifyError(
  response: Response,
  method: string,
  path: string,
): Promise<Error> {
  const body = await readErrorBody(response);
  const spotifyMessage =
    typeof body.error === 'object' ? body.error?.message : body.error_description;
  const sanitizedMessage = spotifyMessage ? sanitizeOneLineText(spotifyMessage) : '';
  const message =
    sanitizedMessage || `Spotify API request failed with HTTP ${response.status}.`;

  if (response.status === 401) {
    return new AuthenticationRequiredError(
      'Spotify authentication has expired or was revoked.\n\nRun: spoti login',
    );
  }
  if (response.status === 403 && /premium/i.test(message)) return new PremiumRequiredError();
  if (
    response.status === 404 &&
    PLAYBACK_CONTROL_REQUESTS.has(`${method} ${path}`) &&
    /\b(?:no active device|device not found)\b/i.test(message)
  ) {
    return new NoActiveDeviceError();
  }
  if (response.status === 429) {
    return new RateLimitedError(getRetryAfterSeconds(response));
  }
  if (response.status >= 500) {
    return new SpotifyApiError(
      `${message}\n\nSpotify may be temporarily unavailable. Try again.`,
      response.status,
    );
  }
  return new SpotifyApiError(message, response.status);
}

async function readErrorBody(response: Response): Promise<SpotifyErrorBody> {
  try {
    return (await response.json()) as SpotifyErrorBody;
  } catch {
    return {};
  }
}
