import { describe, expect, it, vi } from 'vitest';

import { SpotifyClient } from '../src/spotify/client.js';
import {
  AuthenticationRequiredError,
  NoActiveDeviceError,
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

  it('maps authentication and device errors', async () => {
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
      Response.json({ error: { message: 'Device not found' } }, { status: 404 }),
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
