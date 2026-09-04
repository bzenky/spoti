import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestAuthorizationCode } from '../src/auth/callback.js';
import { loadAuthConfig } from '../src/auth/config.js';
import { createCodeChallenge } from '../src/auth/pkce.js';
import {
  OAuthTokenError,
  SpotifyAuthClient,
  type SpotifyAuthApi,
  type TokenSet,
} from '../src/auth/spotify-auth-client.js';
import { AuthService } from '../src/services/auth.service.js';

import {
  FileCredentialStore,
  isTokenExpired,
  type CredentialStore,
  type Credentials,
} from '../src/storage/credentials.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spoti-auth-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('authentication configuration', () => {
  it('requires a client ID from the environment', () => {
    expect(() => loadAuthConfig({})).toThrow('SPOTIFY_CLIENT_ID is required');
    expect(loadAuthConfig({ SPOTIFY_CLIENT_ID: 'custom-client' }).clientId).toBe(
      'custom-client',
    );
  });
});

describe('PKCE', () => {
  it('creates the RFC 7636 S256 challenge fixture', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(createCodeChallenge(verifier)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('Spotify authentication API', () => {
  it('backs off and retries token requests after a 429 response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'rate_limited' },
          { status: 429, headers: { 'retry-after': '1' } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ access_token: 'access', expires_in: 3600 }),
      );
    const sleeper = vi.fn().mockResolvedValue(undefined);
    const client = new SpotifyAuthClient(fetcher, sleeper);

    await expect(
      client.refreshAccessToken({ clientId: 'client', refreshToken: 'refresh' }),
    ).resolves.toEqual({ accessToken: 'access', expiresIn: 3600 });
    expect(sleeper).toHaveBeenCalledWith(1_000);
  });
});

describe('OAuth callback', () => {
  it('ignores a mismatched state and continues waiting for the valid callback', async () => {
    const port = await getAvailablePort();
    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const authorization = requestAuthorizationCode(
      'https://accounts.spotify.com/authorize',
      redirectUri,
      'expected-state',
      {
        timeoutMs: 2_000,
        openBrowser: async () => {
          const wrong = await fetch(`${redirectUri}?state=wrong&code=wrong-code`);
          expect(wrong.status).toBe(400);
          const valid = await fetch(`${redirectUri}?state=expected-state&code=valid-code`);
          expect(valid.status).toBe(200);
        },
      },
    );

    await expect(authorization).resolves.toBe('valid-code');
  });
});

describe('token expiry', () => {
  it('uses a 60-second safety buffer', () => {
    const now = 1_000_000;
    expect(isTokenExpired({ expiresAt: now + 60_001 }, now)).toBe(false);
    expect(isTokenExpired({ expiresAt: now + 60_000 }, now)).toBe(true);
    expect(isTokenExpired({ expiresAt: now - 1 }, now)).toBe(true);
  });
});

describe('FileCredentialStore', () => {
  it('treats a missing file as unauthenticated and deletes idempotently', async () => {
    const store = new FileCredentialStore({
      directory: await createTemporaryDirectory(),
    });

    expect(await store.read()).toBeNull();
    await store.delete();
    await store.delete();
  });


  it('round-trips validated credentials with private file permissions', async () => {
    const store = new FileCredentialStore({
      directory: await createTemporaryDirectory(),
    });
    const credentials: Credentials = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 123_456,
    };

    await store.write(credentials);

    expect(await store.read()).toEqual(credentials);
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
  });

  it('rejects malformed stored credentials', async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileCredentialStore({ directory });
    await writeFile(join(directory, 'credentials.json'), '{"accessToken": 1}');

    await expect(store.read()).rejects.toThrow('invalid format');
  });

  it('atomically replaces previous credentials without leaving temp files as the target', async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileCredentialStore({ directory });
    await store.write({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 });
    await store.write({ accessToken: 'new', refreshToken: 'refresh', expiresAt: 2 });

    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual({
      accessToken: 'new',
      refreshToken: 'refresh',
      expiresAt: 2,
    });
  });
});

describe('AuthService login', () => {
  it('does not replace existing credentials until the new account is verified', async () => {
    const existing: Credentials = {
      accessToken: 'existing-access',
      refreshToken: 'existing-refresh',
      expiresAt: 999_999,
    };
    const store = new MemoryCredentialStore(existing);
    const api: SpotifyAuthApi = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      }),
      refreshAccessToken: vi.fn(),
      getCurrentUser: vi.fn().mockRejectedValue(new Error('profile unavailable')),
    };
    const service = new AuthService({
      credentialStore: store,
      spotifyAuthApi: api,
      loadConfig: () => ({
        clientId: 'client-id',
        redirectUri: 'http://127.0.0.1:43821/callback',
      }),
      requestAuthorizationCode: async () => 'authorization-code',
      createPkcePair: () => ({ verifier: 'verifier', challenge: 'challenge' }),
      createState: () => 'state',
    });

    await expect(service.login()).rejects.toThrow('profile unavailable');
    expect(store.credentials).toEqual(existing);
  });
});

describe('AuthService refresh', () => {
  it('deduplicates concurrent refresh and preserves an omitted refresh token', async () => {
    const credentials: Credentials = {
      accessToken: 'expired',
      refreshToken: 'keep-me',
      expiresAt: 1,
    };
    const store = new MemoryCredentialStore(credentials);
    let releaseRefresh: ((token: TokenSet) => void) | undefined;
    const refreshAccessToken = vi.fn(
      () =>
        new Promise<TokenSet>((resolve) => {
          releaseRefresh = resolve;
        }),
    );
    const api: SpotifyAuthApi = {
      exchangeCode: vi.fn(),
      refreshAccessToken,
      getCurrentUser: vi.fn(),
    };
    const service = new AuthService({
      credentialStore: store,
      spotifyAuthApi: api,
      loadConfig: () => ({
        clientId: 'client-id',
        redirectUri: 'http://127.0.0.1:43821/callback',
      }),
      now: () => 100_000,
    });

    const first = service.getAccessToken();
    const second = service.getAccessToken();
    await vi.waitFor(() => expect(refreshAccessToken).toHaveBeenCalledTimes(1));
    releaseRefresh?.({ accessToken: 'fresh', expiresIn: 3600 });

    await expect(Promise.all([first, second])).resolves.toEqual(['fresh', 'fresh']);
    expect(store.credentials).toEqual({
      accessToken: 'fresh',
      refreshToken: 'keep-me',
      expiresAt: 3_700_000,
    });
  });

  it('clears expired refresh credentials and asks the user to log in again', async () => {
    const store = new MemoryCredentialStore({
      accessToken: 'expired',
      refreshToken: 'expired-refresh',
      expiresAt: 1,
    });
    const api: SpotifyAuthApi = {
      exchangeCode: vi.fn(),
      refreshAccessToken: vi
        .fn()
        .mockRejectedValue(new OAuthTokenError('invalid_grant', 'Refresh token revoked')),
      getCurrentUser: vi.fn(),
    };
    const service = new AuthService({
      credentialStore: store,
      spotifyAuthApi: api,
      loadConfig: () => ({
        clientId: 'client-id',
        redirectUri: 'http://127.0.0.1:43821/callback',
      }),
      now: () => 100_000,
    });

    await expect(service.getAccessToken()).rejects.toThrow('Run: spoti login');
    expect(store.credentials).toBeNull();
  });
});

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a test port.'));
        return;
      }
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

class MemoryCredentialStore implements CredentialStore {
  constructor(public credentials: Credentials | null) {}

  async read(): Promise<Credentials | null> {
    return this.credentials;
  }

  async write(credentials: Credentials): Promise<void> {
    this.credentials = credentials;
  }

  async delete(): Promise<void> {
    this.credentials = null;
  }
}
