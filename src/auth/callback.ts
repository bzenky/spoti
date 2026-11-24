import { createServer, type ServerResponse } from 'node:http';

import open from 'open';

import {
  AppError,
  AuthorizationDeniedError,
  ConfigurationError,
  toError,
} from '../utils/errors.js';
import { renderCallbackPage, type CallbackOutcome } from './callback-page.js';
import { validateRedirectUri } from './config.js';

const DEFAULT_TIMEOUT_MS = 120_000;

type BrowserOpener = (url: string) => Promise<unknown>;

export interface AuthorizationCallbackOptions {
  timeoutMs?: number;
  openBrowser?: BrowserOpener;
  onListening?: () => void;
}

export function requestAuthorizationCode(
  authorizationUrl: string,
  redirectUri: string,
  expectedState: string,
  options: AuthorizationCallbackOptions = {},
): Promise<string> {
  const callbackUrl = validateRedirectUri(redirectUri);
  const port = Number(callbackUrl.port);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const openBrowser = options.openBrowser ?? open;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const respond = (
      response: ServerResponse,
      status: number,
      outcome: CallbackOutcome,
    ): void => {
      response.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      response.end(renderCallbackPage(outcome));
    };

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', callbackUrl.origin);
      if (request.method !== 'GET' || requestUrl.pathname !== callbackUrl.pathname) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const finish = (error: Error | null, code?: string): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        server.close();
        if (error) reject(error);
        else if (code) resolve(code);
        else reject(new AppError('Spotify authorization returned no code.'));
      };

      if (requestUrl.searchParams.get('state') !== expectedState) {
        respond(response, 400, 'failed');
        return;
      }

      const authorizationError = requestUrl.searchParams.get('error');
      if (authorizationError) {
        const description = requestUrl.searchParams.get('error_description');
        respond(response, 400, 'denied');
        finish(
          new AuthorizationDeniedError(
            description || `Spotify authorization failed: ${authorizationError}`,
          ),
        );
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        respond(response, 400, 'failed');
        finish(new AppError('Spotify authorization returned no code.'));
        return;
      }

      respond(response, 200, 'success');
      finish(null, code);
    });

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (server.listening) server.close();
      reject(toError(error));
    };

    server.once('error', (error: NodeJS.ErrnoException) => {
      fail(error.code === 'EADDRINUSE' ? portInUseError(redirectUri, port) : error);
    });
    server.listen(port, '127.0.0.1', () => {
      timer = setTimeout(() => {
        fail(timeoutError(redirectUri, port, timeoutMs));
      }, timeoutMs);
      timer.unref();

      options.onListening?.();
      void openBrowser(authorizationUrl).catch(() => undefined);
    });
  });
}

function timeoutError(
  redirectUri: string,
  port: number,
  timeoutMs: number,
): AuthorizationDeniedError {
  const minutes = timeoutMs / 60_000;
  const seconds = Math.round(timeoutMs / 1_000);
  const duration = Number.isInteger(minutes)
    ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
    : `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  return new AuthorizationDeniedError(
    [
      `Spotify authorization timed out after ${duration}.`,
      '',
      'If Spotify showed "INVALID_CLIENT: Invalid redirect URI", add this exact',
      'Redirect URI in your app settings at https://developer.spotify.com/dashboard:',
      `  ${redirectUri}`,
      '',
      'If it showed "INVALID_CLIENT: Invalid client", check the client ID with: spoti setup',
      '',
      `Over SSH, forward the callback port before logging in: ssh -L ${port}:127.0.0.1:${port} <host>`,
      '',
      'Then run: spoti login',
    ].join('\n'),
  );
}

function portInUseError(redirectUri: string, port: number): ConfigurationError {
  return new ConfigurationError(
    [
      `spoti could not receive the Spotify callback: port ${port} on 127.0.0.1 is already in use.`,
      '',
      'Close any other running spoti login and try again.',
      `To use another port, register it as a Redirect URI in your Spotify app (currently ${redirectUri})`,
      'and set SPOTIFY_REDIRECT_URI, for example:',
      '  export SPOTIFY_REDIRECT_URI="http://127.0.0.1:43822/callback"',
    ].join('\n'),
  );
}
