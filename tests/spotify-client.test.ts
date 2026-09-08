import { describe, expect, it, vi } from 'vitest';

import { SpotifyClient } from '../src/spotify/client.js';
import {
  AuthenticationRequiredError,
  NoActiveDeviceError,
  RateLimitedError,
  SpotifyApiError,
} from '../src/utils/errors.js';

describe('SpotifyClient', () => {
  it('adds authorization, query parameters, and supports 204 responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
    );

    await expect(client.put('/me/player/play', { query: { device_id: 'abc' } })).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toContain('/me/player/play?device_id=abc');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
  });

  it('passes cancellation to fetch and preserves an external AbortError', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const signal = init?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal).not.toBe(controller.signal);
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
    );

    const request = client.get('/search', { signal: controller.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();

    await expect(request).rejects.toBe(controller.signal.reason);
    expect((controller.signal.reason as Error).name).toBe('AbortError');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('keeps external cancellation active while consuming a response body', async () => {
    const controller = new AbortController();
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener');
    let requestSignal: AbortSignal | undefined;
    const text = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => {
              reject(requestSignal?.reason);
            },
            { once: true },
          );
        }),
    );
    const response = {
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text,
    } as unknown as Response;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return response;
    });
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
    );

    const request = client.get('/search', { signal: controller.signal });
    await vi.waitFor(() => expect(text).toHaveBeenCalledOnce());
    controller.abort();

    await expect(request).rejects.toBe(controller.signal.reason);
    expect((controller.signal.reason as Error).name).toBe('AbortError');
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('stops an injected rate-limit backoff promptly when externally aborted', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: { message: 'Rate limited' } },
        { status: 429, headers: { 'retry-after': '3' } },
      ),
    );
    const sleeper = vi.fn(() => new Promise<void>(() => undefined));
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
      sleeper,
    );

    const request = client.get('/search', { signal: controller.signal });
    await vi.waitFor(() => expect(sleeper).toHaveBeenCalledWith(3_000));
    controller.abort();

    await expect(request).rejects.toBe(controller.signal.reason);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('ignores undocumented non-JSON bodies from successful mutation responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('OWojkD0UZS', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
    );

    await expect(client.put('/me/player/pause')).resolves.toBeUndefined();
  });

  it('reports malformed or non-JSON data responses without exposing their body', async () => {
    const auth = {
      getAccessToken: async () => 'token',
      forceRefreshAccessToken: async () => 'refreshed-token',
    };
    const nonJson = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('unexpected', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await expect(new SpotifyClient(auth, nonJson).get('/me')).rejects.toThrow(
      'unexpected non-JSON response',
    );

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{broken', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(new SpotifyClient(auth, malformed).get('/me')).rejects.toBeInstanceOf(
      SpotifyApiError,
    );
  });

  it('makes network and temporary Spotify failures actionable', async () => {
    const auth = {
      getAccessToken: async () => 'token',
      forceRefreshAccessToken: async () => 'refreshed-token',
    };
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error('connection reset'));
    await expect(new SpotifyClient(auth, networkFailure).get('/search')).rejects.toThrow(
      'Check your network connection and try again.',
    );

    const serviceFailure = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: 'Service unavailable' } }, { status: 503 }),
    );
    await expect(new SpotifyClient(auth, serviceFailure).get('/search')).rejects.toThrow(
      'Service unavailable\n\nSpotify may be temporarily unavailable. Try again.',
    );
  });

  it('maps authentication and playback-control device errors', async () => {
    const authFailure = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: 'Invalid access token' } }, { status: 401 }),
    );
    await expect(
      new SpotifyClient(
        {
          getAccessToken: async () => 'token',
          forceRefreshAccessToken: async () => 'refreshed-token',
        },
        authFailure,
      ).get('/me'),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(authFailure).toHaveBeenCalledTimes(2);

    const deviceFailure = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: 'No active device found' } }, { status: 404 }),
    );
    await expect(
      new SpotifyClient(
        {
          getAccessToken: async () => 'token',
          forceRefreshAccessToken: async () => 'refreshed-token',
        },
        deviceFailure,
      ).put('/me/player/play'),
    ).rejects.toBeInstanceOf(NoActiveDeviceError);
  });

  it('does not map unrelated endpoints or messages to device errors', async () => {
    const auth = {
      getAccessToken: async () => 'token',
      forceRefreshAccessToken: async () => 'refreshed-token',
    };
    const unrelatedEndpoint = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: 'Device not found' } }, { status: 404 }),
    );
    await expect(
      new SpotifyClient(auth, unrelatedEndpoint).get('/me/player/devices'),
    ).rejects.toBeInstanceOf(SpotifyApiError);

    const unrelatedMessage = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ error: { message: 'Device authorization failed' } }, { status: 404 }),
    );
    await expect(
      new SpotifyClient(auth, unrelatedMessage).put('/me/player/play'),
    ).rejects.toBeInstanceOf(SpotifyApiError);
  });

  it('respects Retry-After and exponentially backs off after 429 responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: 'Rate limited' } },
          { status: 429, headers: { 'retry-after': '2' } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'Rate limited' } }, { status: 429 }),
      )
      .mockResolvedValueOnce(Response.json({ tracks: { items: [] } }));
    const sleeper = vi.fn().mockResolvedValue(undefined);
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
      sleeper,
    );

    await expect(client.get('/search')).resolves.toEqual({ tracks: { items: [] } });
    expect(sleeper).toHaveBeenNthCalledWith(1, 2_000);
    expect(sleeper).toHaveBeenNthCalledWith(2, 1_000);
  });

  it('reports long rate limits immediately instead of blocking the CLI', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: { message: 'Too many requests' } },
        { status: 429, headers: { 'retry-after': '56321' } },
      ),
    );
    const sleeper = vi.fn().mockResolvedValue(undefined);
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
      sleeper,
    );

    await expect(client.get('/search')).rejects.toThrow(
      'Spotify rate limit reached. Try again in 15 hours 39 minutes.',
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('normalizes Retry-After for waits and final rate-limit errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json(
        { error: { message: 'Rate limited' } },
        { status: 429, headers: { 'retry-after': '1.2' } },
      ),
    );
    const sleeper = vi.fn().mockResolvedValue(undefined);
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
      sleeper,
    );

    const error = await client.get('/search').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toMatchObject({ retryAfterSeconds: 2 });
    expect((error as Error).message).toContain('2 seconds');
    expect(sleeper).toHaveBeenNthCalledWith(1, 2_000);

    const negativeFetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json(
        { error: { message: 'Rate limited' } },
        { status: 429, headers: { 'retry-after': '-4' } },
      ),
    );
    const negativeError = await new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      negativeFetcher,
      vi.fn().mockResolvedValue(undefined),
    )
      .get('/search')
      .catch((caught: unknown) => caught);
    expect(negativeError).toMatchObject({ retryAfterSeconds: 1 });
    expect((negativeError as Error).message).toContain('1 second');
    expect(new RateLimitedError(1).message).toContain('1 second.');
  });

  it('sanitizes external Spotify error messages for terminal output', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { error: { message: 'Bad\nmessage\u001b[31m!\u0000' } },
        { status: 400 },
      ),
    );
    const client = new SpotifyClient(
      {
        getAccessToken: async () => 'token',
        forceRefreshAccessToken: async () => 'refreshed-token',
      },
      fetcher,
    );

    const error = await client.get('/search').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpotifyApiError);
    expect((error as Error).message).toBe('Bad message!');
    expect((error as Error).message).not.toMatch(/[\n\r]/);
  });

  it('refreshes and retries exactly once after an early 401', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'Expired token' } }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'user' }));
    const forceRefreshAccessToken = vi.fn().mockResolvedValue('fresh-token');
    const client = new SpotifyClient(
      { getAccessToken: async () => 'stale-token', forceRefreshAccessToken },
      fetcher,
    );

    await expect(client.get('/me')).resolves.toEqual({ id: 'user' });
    expect(forceRefreshAccessToken).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(
      'Bearer fresh-token',
    );
  });
});
