import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  compareSemanticVersions,
  NodeUpdateCommandRunner,
  NPM_REGISTRY_URL,
  UPDATE_CHECK_INTERVAL_MS,
  UpdateCheckError,
  UpdateInstallError,
  UpdateService,
  type NodeUpdateCommandRunnerDependencies,
  type UpdateCommandRunner,
} from '../src/services/update.service.js';
import type { UpdateCache, UpdateCacheStore } from '../src/storage/update-cache.js';
import { runBackgroundUpdateCheck } from '../src/update-worker.js';

class MemoryUpdateCache implements UpdateCacheStore {
  value: UpdateCache | null;
  readonly read = vi.fn(async () => this.value);
  readonly write = vi.fn(async (cache: UpdateCache) => {
    this.value = cache;
  });

  constructor(value: UpdateCache | null = null) {
    this.value = value;
  }
}

function registryResponse(latest: unknown): Response {
  return new Response(JSON.stringify({ 'dist-tags': { latest } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetch(response: Response): typeof fetch {
  return vi.fn(async () => response);
}

describe('semantic version comparison', () => {
  it.each([
    ['0.3.0', '0.2.0', 1],
    ['0.2.0', '0.2.0', 0],
    ['1.0.0-alpha', '1.0.0', -1],
    ['1.0.0-alpha.2', '1.0.0-alpha.10', -1],
    ['1.0.0-beta', '1.0.0-alpha.99', 1],
    ['1.0.0+new-build', '1.0.0+old-build', 0],
    ['100000000000000000000.0.0', '99999999999999999999.0.0', 1],
  ] as const)('compares %s with %s', (left, right, expected) => {
    expect(Math.sign(compareSemanticVersions(left, right))).toBe(expected);
  });

  it.each(['v1.0.0', '1.0', '01.0.0', '1.0.0-', '1.0.0-alpha..1']) (
    'rejects malformed version %s',
    (version) => {
      expect(() => compareSemanticVersions(version, '1.0.0')).toThrow(TypeError);
    },
  );
});

describe('UpdateService checks', () => {
  it('reports a newer registry version using native fetch metadata', async () => {
    const fetchImplementation = createFetch(registryResponse('0.3.0'));
    const service = new UpdateService('0.2.0', {
      cache: new MemoryUpdateCache(),
      fetch: fetchImplementation,
      now: () => 10_000,
    });

    await expect(service.checkForeground()).resolves.toEqual({
      status: 'update-available',
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      checkedAt: 10_000,
      source: 'registry',
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      NPM_REGISTRY_URL,
      expect.objectContaining({
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ['0.2.0', '0.2.0'],
    ['1.0.0', '1.0.0-beta.1'],
  ])('reports %s as current when npm latest is %s', async (current, latest) => {
    const service = new UpdateService(current, {
      cache: new MemoryUpdateCache(),
      fetch: createFetch(registryResponse(latest)),
    });

    await expect(service.checkForeground()).resolves.toMatchObject({
      status: 'current',
      currentVersion: current,
      latestVersion: latest,
    });
  });

  it.each([
    ['missing latest', new Response(JSON.stringify({ 'dist-tags': {} }))],
    ['non-string latest', registryResponse(3)],
    ['invalid semantic version', registryResponse('not-a-version')],
    ['malformed JSON', new Response('{')],
  ])('gives an actionable foreground error for %s metadata', async (_label, response) => {
    const service = new UpdateService('0.2.0', {
      cache: new MemoryUpdateCache(),
      fetch: createFetch(response),
    });

    await expect(service.checkForeground()).rejects.toBeInstanceOf(UpdateCheckError);
  });

  it('gives an actionable foreground error for registry HTTP and network failures', async () => {
    const httpService = new UpdateService('0.2.0', {
      cache: new MemoryUpdateCache(),
      fetch: createFetch(new Response(null, { status: 503, statusText: 'Unavailable' })),
    });
    await expect(httpService.checkForeground()).rejects.toThrow('HTTP 503 Unavailable');

    const networkService = new UpdateService('0.2.0', {
      cache: new MemoryUpdateCache(),
      fetch: vi.fn(async () => {
        throw new TypeError('socket unavailable');
      }),
    });
    await expect(networkService.checkForeground()).rejects.toThrow(
      'Unable to reach the npm registry: socket unavailable',
    );
  });

  it('reuses a successful cache for 24 hours and refreshes it after expiry', async () => {
    let now = 10_000;
    const cache = new MemoryUpdateCache();
    const fetchImplementation: typeof fetch = vi.fn(async () => registryResponse('0.3.0'));
    const service = new UpdateService('0.2.0', {
      cache,
      fetch: fetchImplementation,
      now: () => now,
    });

    await expect(service.checkInBackground()).resolves.toMatchObject({ source: 'registry' });
    now += UPDATE_CHECK_INTERVAL_MS - 1;
    await expect(service.checkInBackground()).resolves.toMatchObject({
      status: 'update-available',
      source: 'cache',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);

    now += 1;
    await expect(service.checkInBackground()).resolves.toMatchObject({ source: 'registry' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an invalid cached latest version', '0.2.0', 'invalid'],
    ['a cache from another installed version', '0.1.0', '0.3.0'],
  ])('refreshes %s even when its timestamp is fresh', async (_label, cachedCurrent, cachedLatest) => {
    const cache = new MemoryUpdateCache({
      version: 1,
      lastCheckedAt: 9_999,
      lastSuccessfulCheck: {
        checkedAt: 9_999,
        currentVersion: cachedCurrent,
        latestVersion: cachedLatest,
      },
    });
    const fetchImplementation = createFetch(registryResponse('0.3.0'));
    const service = new UpdateService('0.2.0', {
      cache,
      fetch: fetchImplementation,
      now: () => 10_000,
    });

    await expect(service.checkInBackground()).resolves.toMatchObject({
      status: 'update-available',
      source: 'registry',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('records failed attempts and does not retry them for 24 hours', async () => {
    let now = 50_000;
    const cache = new MemoryUpdateCache();
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const service = new UpdateService('0.2.0', {
      cache,
      fetch: fetchImplementation,
      now: () => now,
    });

    await expect(service.checkInBackground()).resolves.toBeNull();
    expect(cache.value).toMatchObject({
      lastCheckedAt: now,
      lastFailedCheckAt: now,
    });

    now += UPDATE_CHECK_INTERVAL_MS - 1;
    await expect(service.checkInBackground()).resolves.toBeNull();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('always performs an explicit foreground check even when the cache is fresh', async () => {
    const cache = new MemoryUpdateCache({
      version: 1,
      lastCheckedAt: 9_999,
      lastSuccessfulCheck: {
        checkedAt: 9_999,
        currentVersion: '0.2.0',
        latestVersion: '0.2.0',
      },
    });
    const fetchImplementation = createFetch(registryResponse('0.3.0'));
    const service = new UpdateService('0.2.0', {
      cache,
      fetch: fetchImplementation,
      now: () => 10_000,
    });

    await expect(service.checkForeground()).resolves.toMatchObject({
      status: 'update-available',
      source: 'registry',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('keeps background worker failures silent', async () => {
    const checker = {
      checkInBackground: vi.fn(async () => {
        throw new Error('unexpected cache failure');
      }),
    };

    await expect(runBackgroundUpdateCheck(checker)).resolves.toBeNull();
  });
});

describe('NodeUpdateCommandRunner', () => {
  it.each([
    ['win32', 'npm.cmd'],
    ['linux', 'npm'],
  ] as const)('spawns %s npm commands as %s without a shell', async (platform, executable) => {
    const child = new EventEmitter();
    const spawnImplementation = vi.fn(() => child);
    const runner = new NodeUpdateCommandRunner({
      platform,
      spawn: spawnImplementation as unknown as NonNullable<
        NodeUpdateCommandRunnerDependencies['spawn']
      >,
    });

    const result = runner.run('npm', ['install', '--global', '@bzenky/spoti@0.3.0']);
    child.emit('exit', 0, null);

    await expect(result).resolves.toBeUndefined();
    expect(spawnImplementation).toHaveBeenCalledWith(
      executable,
      ['install', '--global', '@bzenky/spoti@0.3.0'],
      { stdio: 'inherit', shell: false },
    );
  });
});

describe('confirmed update installation', () => {
  it('requires confirmation and invokes an injectable npm command runner', async () => {
    const commandRunner: UpdateCommandRunner = { run: vi.fn(async () => undefined) };
    const service = new UpdateService('0.2.0', {
      cache: new MemoryUpdateCache(),
      fetch: createFetch(registryResponse('0.3.0')),
      commandRunner,
    });

    await expect(service.installLatest(false, '0.3.0')).rejects.toBeInstanceOf(UpdateInstallError);
    await expect(service.installLatest(true, 'latest; rm -rf /')).rejects.toBeInstanceOf(
      UpdateInstallError,
    );
    expect(commandRunner.run).not.toHaveBeenCalled();

    await service.installLatest(true, '0.3.0');
    expect(commandRunner.run).toHaveBeenCalledWith('npm', [
      'install',
      '--global',
      '@bzenky/spoti@0.3.0',
    ]);
  });
});
