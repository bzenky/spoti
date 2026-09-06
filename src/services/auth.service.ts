import {
  LEGACY_SPOTIFY_SCOPES,
  SPOTIFY_SCOPES,
} from '../spotify/scopes.js';
import type { UserProfile } from './models.js';
import {
  generateOAuthState,
  generatePkcePair,
  type PkcePair,
} from '../auth/pkce.js';
import { loadAuthConfig, type AuthConfig } from '../auth/config.js';
import { requestAuthorizationCode } from '../auth/callback.js';
import {
  OAuthTokenError,
  SpotifyAuthClient,
  type SpotifyAuthApi,
  type TokenSet,
} from '../auth/spotify-auth-client.js';
import {
  FileCredentialStore,
  isTokenExpired,
  type CredentialStore,
  type Credentials,
} from '../storage/credentials.js';
import { FileConfigStore } from '../storage/config.js';
import {
  AuthenticationRequiredError,
  ConfigurationError,
} from '../utils/errors.js';

const AUTHORIZE_ENDPOINT = 'https://accounts.spotify.com/authorize';

type AuthorizationCodeProvider = (
  authorizationUrl: string,
  redirectUri: string,
  expectedState: string,
) => Promise<string>;

export interface AuthServiceDependencies {
  credentialStore?: CredentialStore;
  spotifyAuthApi?: SpotifyAuthApi;
  loadConfig?: () => AuthConfig | Promise<AuthConfig>;
  requestAuthorizationCode?: AuthorizationCodeProvider;
  createPkcePair?: () => PkcePair;
  createState?: () => string;
  now?: () => number;
}

export class AuthService {
  private readonly credentialStore: CredentialStore;
  private readonly spotifyAuthApi: SpotifyAuthApi;
  private readonly configLoader: () => AuthConfig | Promise<AuthConfig>;
  private readonly authorizationCodeProvider: AuthorizationCodeProvider;
  private readonly pkceFactory: () => PkcePair;
  private readonly stateFactory: () => string;
  private readonly clock: () => number;
  private refreshPromise: Promise<string> | undefined;

  constructor(dependencies: AuthServiceDependencies = {}) {
    this.credentialStore = dependencies.credentialStore ?? new FileCredentialStore();
    this.spotifyAuthApi = dependencies.spotifyAuthApi ?? new SpotifyAuthClient();
    this.configLoader =
      dependencies.loadConfig ??
      (async () => {
        const config = await new FileConfigStore().read();
        return loadAuthConfig(process.env, config.spotifyClientId);
      });
    this.authorizationCodeProvider =
      dependencies.requestAuthorizationCode ?? requestAuthorizationCode;
    this.pkceFactory = dependencies.createPkcePair ?? generatePkcePair;
    this.stateFactory = dependencies.createState ?? generateOAuthState;
    this.clock = dependencies.now ?? Date.now;
  }

  async login(): Promise<UserProfile> {
    const config = await this.configLoader();
    const pkce = this.pkceFactory();
    const state = this.stateFactory();
    const authorizationUrl = createAuthorizationUrl(config, pkce.challenge, state);
    const code = await this.authorizationCodeProvider(
      authorizationUrl,
      config.redirectUri,
      state,
    );
    const token = await this.spotifyAuthApi.exchangeCode({
      clientId: config.clientId,
      code,
      redirectUri: config.redirectUri,
      codeVerifier: pkce.verifier,
    });

    if (!token.refreshToken) {
      throw new ConfigurationError('Spotify did not return a refresh token during login.');
    }

    const credentials: Credentials = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: this.clock() + token.expiresIn * 1_000,
      scopes: token.scopes ?? [...SPOTIFY_SCOPES],
    };
    const user = await this.spotifyAuthApi.getCurrentUser(credentials.accessToken);
    await this.credentialStore.write(credentials);
    return user;
  }

  async logout(): Promise<void> {
    await this.credentialStore.delete();
  }

  async getAccessToken(): Promise<string> {
    const credentials = await this.credentialStore.read();
    if (!credentials) throw new AuthenticationRequiredError();
    const grantedScopes = credentials.scopes ?? [...LEGACY_SPOTIFY_SCOPES];
    const missingScopes = SPOTIFY_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new AuthenticationRequiredError(
        `spoti needs new Spotify permissions (${missingScopes.join(', ')}).\n\nRun: spoti login`,
      );
    }
    if (!isTokenExpired(credentials, this.clock())) return credentials.accessToken;

    return this.startTokenRefresh(credentials);
  }

  async forceRefreshAccessToken(): Promise<string> {
    const credentials = await this.credentialStore.read();
    if (!credentials) throw new AuthenticationRequiredError();
    return this.startTokenRefresh(credentials);
  }

  async getCurrentUser(): Promise<UserProfile> {
    const accessToken = await this.getAccessToken();
    return this.spotifyAuthApi.getCurrentUser(accessToken);
  }

  async isAuthenticated(): Promise<boolean> {
    return (await this.credentialStore.read()) !== null;
  }

  private startTokenRefresh(credentials: Credentials): Promise<string> {
    if (!this.refreshPromise) {
      const refreshPromise = this.performTokenRefresh(credentials);
      this.refreshPromise = refreshPromise;
      void refreshPromise
        .finally(() => {
          if (this.refreshPromise === refreshPromise) this.refreshPromise = undefined;
        })
        .catch(() => undefined);
    }
    return this.refreshPromise;
  }

  private async performTokenRefresh(credentials: Credentials): Promise<string> {
    const config = await this.configLoader();
    let token: TokenSet;
    try {
      token = await this.spotifyAuthApi.refreshAccessToken({
        clientId: config.clientId,
        refreshToken: credentials.refreshToken,
      });
    } catch (error) {
      if (error instanceof OAuthTokenError && error.code === 'invalid_grant') {
        await this.credentialStore.delete();
        throw new AuthenticationRequiredError(
          'Your Spotify session has expired or was revoked.\n\nRun: spoti login',
        );
      }
      throw error;
    }
    const updatedCredentials: Credentials = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? credentials.refreshToken,
      expiresAt: this.clock() + token.expiresIn * 1_000,
      scopes:
        token.scopes ?? credentials.scopes ?? [...LEGACY_SPOTIFY_SCOPES],
    };
    await this.credentialStore.write(updatedCredentials);
    return updatedCredentials.accessToken;
  }
}

export function createAuthorizationUrl(
  config: AuthConfig,
  codeChallenge: string,
  state: string,
): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
    scope: SPOTIFY_SCOPES.join(' '),
  }).toString();
  return url.toString();
}
