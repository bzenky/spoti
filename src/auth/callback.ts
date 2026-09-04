import { createServer } from 'node:http';

import open from 'open';

import {
  AppError,
  AuthorizationDeniedError,
  toError,
} from '../utils/errors.js';
import { validateRedirectUri } from './config.js';

const DEFAULT_TIMEOUT_MS = 120_000;

type BrowserOpener = (url: string) => Promise<unknown>;

export interface AuthorizationCallbackOptions {
  timeoutMs?: number;
  openBrowser?: BrowserOpener;
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
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Authorization state mismatch. You can close this window.');
        return;
      }

      const authorizationError = requestUrl.searchParams.get('error');
      if (authorizationError) {
        const description = requestUrl.searchParams.get('error_description');
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Spotify authorization was denied. You can close this window.');
        finish(
          new AuthorizationDeniedError(
            description || `Spotify authorization failed: ${authorizationError}`,
          ),
        );
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('No authorization code was received. You can close this window.');
        finish(new AppError('Spotify authorization returned no code.'));
        return;
      }

      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Authorization complete. You can close this window.');
      finish(null, code);
    });

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (server.listening) server.close();
      reject(toError(error));
    };

    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      timer = setTimeout(() => {
        fail(new AuthorizationDeniedError('Spotify authorization timed out after 2 minutes.'));
      }, timeoutMs);
      timer.unref();

      void openBrowser(authorizationUrl).catch(fail);
    });
  });
}
