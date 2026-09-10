import { z } from 'zod';

import type { UserProfile } from '../services/models.js';
import { AppError, RateLimitedError, toError } from '../utils/errors.js';

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const CURRENT_USER_ENDPOINT = 'https://api.spotify.com/v1/me';
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS = 5;

type Sleep = (milliseconds: number) => Promise<void>;

const sleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

const userProfileSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullable(),
  product: z.string().optional(),
});

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes?: string[];
}

export interface ExchangeCodeInput {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface RefreshTokenInput {
  clientId: string;
  refreshToken: string;
}

export class OAuthTokenError extends AppError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SpotifyAuthApi {
  exchangeCode(input: ExchangeCodeInput): Promise<TokenSet>;
  refreshAccessToken(input: RefreshTokenInput): Promise<TokenSet>;
  getCurrentUser(accessToken: string): Promise<UserProfile>;
}

export class SpotifyAuthClient implements SpotifyAuthApi {
  constructor(
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
    private readonly sleeper: Sleep = sleep,
  ) {}

  async exchangeCode(input: ExchangeCodeInput): Promise<TokenSet> {
    return this.requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: input.clientId,
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    );
  }

  async refreshAccessToken(input: RefreshTokenInput): Promise<TokenSet> {
    return this.requestToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: input.clientId,
        refresh_token: input.refreshToken,
      }),
    );
  }

  async getCurrentUser(accessToken: string): Promise<UserProfile> {
    const response = await this.fetchWithTimeout(CURRENT_USER_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new AppError(getErrorMessage(body, 'Unable to fetch the current Spotify user.'));
    }

    const profile = userProfileSchema.safeParse(body);
    if (!profile.success) {
      throw new AppError('Spotify returned an invalid user profile response.');
    }

    const result: UserProfile = {
      id: profile.data.id,
      displayName: profile.data.display_name ?? profile.data.id,
    };
    if (profile.data.product !== undefined) result.product = profile.data.product;
    return result;
  }

  private async requestToken(parameters: URLSearchParams): Promise<TokenSet> {
    const response = await this.fetchWithTimeout(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: parameters,
    });
    const body = await readJson(response);
    if (!response.ok) {
      const oauthErrorCode = getOAuthErrorCode(body);
      const message = getErrorMessage(body, 'Spotify token request failed.');
      if (oauthErrorCode) throw new OAuthTokenError(oauthErrorCode, message);
      throw new AppError(message);
    }

    const token = tokenResponseSchema.safeParse(body);
    if (!token.success) {
      throw new AppError('Spotify returned an invalid token response.');
    }

    const result: TokenSet = {
      accessToken: token.data.access_token,
      expiresIn: token.data.expires_in,
    };
    if (token.data.refresh_token !== undefined) {
      result.refreshToken = token.data.refresh_token;
    }
    if (token.data.scope !== undefined) {
      result.scopes = token.data.scope.split(' ').filter(Boolean);
    }
    return result;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImplementation(url, {
          ...init,
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        const normalizedError = toError(error);
        if (normalizedError.name === 'TimeoutError') {
          throw new AppError('Spotify did not respond within 15 seconds. Try again.');
        }
        throw new AppError(`Unable to reach Spotify: ${normalizedError.message}`);
      }

      if (response.status !== 429) return response;
      const retryAfterValue = Number(response.headers.get('retry-after'));
      const retryAfterSeconds =
        Number.isFinite(retryAfterValue) && retryAfterValue >= 0
          ? Math.ceil(retryAfterValue)
          : 1;
      if (
        attempt >= MAX_RATE_LIMIT_RETRIES ||
        retryAfterSeconds > MAX_AUTOMATIC_RATE_LIMIT_WAIT_SECONDS
      ) {
        throw new RateLimitedError(retryAfterSeconds);
      }
      await this.sleeper(Math.max(retryAfterSeconds * 1_000, 500 * 2 ** attempt));
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError('Spotify returned a malformed response.');
  }
}

function getOAuthErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as Record<string, unknown>).error;
  return typeof error === 'string' ? error : null;
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.error_description === 'string') return record.error_description;
  if (typeof record.error === 'string') return `Spotify request failed: ${record.error}`;
  if (record.error && typeof record.error === 'object') {
    const nestedError = record.error as Record<string, unknown>;
    if (typeof nestedError.message === 'string') return nestedError.message;
  }
  return fallback;
}
