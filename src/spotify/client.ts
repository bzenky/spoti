import {
  AppError,
  AuthenticationRequiredError,
  NoActiveDeviceError,
  PremiumRequiredError,
  RateLimitedError,
  SpotifyApiError,
  toError,
} from '../utils/errors.js';
import type { SpotifyErrorBody } from './types.js';

const API_BASE_URL = 'https://api.spotify.com/v1';
const MAX_RATE_LIMIT_RETRIES = 3;

type Sleep = (milliseconds: number) => Promise<void>;

const sleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
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

    const execute = async (token: string): Promise<Response> => {
      headers.set('Authorization', `Bearer ${token}`);
      try {
        return await this.fetcher(url, {
          method,
          headers,
          signal: AbortSignal.timeout(15_000),
          ...(body === undefined ? {} : { body }),
        });
      } catch (error) {
        const normalizedError = toError(error);
        if (normalizedError.name === 'TimeoutError') {
          throw new AppError('Spotify did not respond within 15 seconds. Try again.');
        }
        throw new AppError(`Unable to reach Spotify: ${normalizedError.message}`);
      }
    };

    let accessToken = await this.authService.getAccessToken();
    let refreshedToken = false;
    let rateLimitRetries = 0;
    let response: Response;

    while (true) {
      response = await execute(accessToken);
      if (response.status === 401 && !refreshedToken) {
        accessToken = await this.authService.forceRefreshAccessToken();
        refreshedToken = true;
        continue;
      }
      if (response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
        const retryAfterMs = getRetryAfterMilliseconds(response);
        const exponentialBackoffMs = 500 * 2 ** rateLimitRetries;
        rateLimitRetries += 1;
        await this.sleeper(Math.max(retryAfterMs, exponentialBackoffMs));
        continue;
      }
      break;
    }

    if (!response.ok) throw await mapSpotifyError(response);
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

function getRetryAfterMilliseconds(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 0;
}

async function mapSpotifyError(response: Response): Promise<Error> {
  const body = await readErrorBody(response);
  const spotifyMessage =
    typeof body.error === 'object' ? body.error?.message : body.error_description;
  const message = spotifyMessage || `Spotify API request failed with HTTP ${response.status}.`;

  if (response.status === 401) {
    return new AuthenticationRequiredError(
      'Spotify authentication has expired or was revoked.\n\nRun: spoti login',
    );
  }
  if (response.status === 403 && /premium/i.test(message)) return new PremiumRequiredError();
  if (response.status === 404 && /device/i.test(message)) return new NoActiveDeviceError();
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '1');
    return new RateLimitedError(Number.isFinite(retryAfter) ? retryAfter : 1);
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
