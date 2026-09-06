import { ConfigurationError } from '../utils/errors.js';

export const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:43821/callback';

export interface AuthConfig {
  clientId: string;
  redirectUri: string;
}

export function loadAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
  storedClientId: string | null = null,
): AuthConfig {
  const clientId = environment.SPOTIFY_CLIENT_ID?.trim() || storedClientId?.trim();
  if (!clientId) {
    throw new ConfigurationError(
      'A Spotify client ID is required.\n\nRun: spoti setup\nOr set SPOTIFY_CLIENT_ID in your environment.',
    );
  }

  const redirectUri = environment.SPOTIFY_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
  validateRedirectUri(redirectUri);

  return { clientId, redirectUri };
}

export function validateRedirectUri(redirectUri: string): URL {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new ConfigurationError('SPOTIFY_REDIRECT_URI must be a valid URL.');
  }

  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ConfigurationError(
      'SPOTIFY_REDIRECT_URI must be an HTTP URL on 127.0.0.1 with an explicit port, path, and no query or fragment.',
    );
  }

  return url;
}
