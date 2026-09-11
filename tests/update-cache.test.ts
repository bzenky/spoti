import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  FileUpdateCacheStore,
  type UpdateCache,
} from '../src/storage/update-cache.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spoti-update-cache-'));
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

const successfulCache: UpdateCache = {
  version: 1,
  lastCheckedAt: 1_000,
  lastSuccessfulCheck: {
    checkedAt: 1_000,
    currentVersion: '0.2.0',
    latestVersion: '0.3.0',
  },
};

describe('FileUpdateCacheStore', () => {
  it('returns null when the cache is missing', async () => {
    const store = new FileUpdateCacheStore({ directory: await createTemporaryDirectory() });

    await expect(store.read()).resolves.toBeNull();
  });

  it('writes atomically with private directory and file permissions', async () => {
    const root = await createTemporaryDirectory();
    const directory = join(root, 'nested', 'spoti');
    const store = new FileUpdateCacheStore({ directory });

    await store.write(successfulCache);

    await expect(store.read()).resolves.toEqual(successfulCache);
    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    }
    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual(successfulCache);
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each([
    ['invalid JSON', '{'],
    ['wrong shape', JSON.stringify({ lastCheckedAt: 1_000 })],
    [
      'inconsistent timestamps',
      JSON.stringify({
        ...successfulCache,
        lastCheckedAt: 2_000,
      }),
    ],
  ])('treats %s as a cache miss and recovers on the next write', async (_label, contents) => {
    const directory = await createTemporaryDirectory();
    const store = new FileUpdateCacheStore({ directory });
    await writeFile(store.path, contents);

    await expect(store.read()).resolves.toBeNull();
    await store.write(successfulCache);
    await expect(store.read()).resolves.toEqual(successfulCache);
  });

  it('stores both the most recent failure and the last successful versions', async () => {
    const store = new FileUpdateCacheStore({ directory: await createTemporaryDirectory() });
    const cache: UpdateCache = {
      ...successfulCache,
      lastCheckedAt: 2_000,
      lastFailedCheckAt: 2_000,
    };

    await store.write(cache);

    await expect(store.read()).resolves.toEqual(cache);
  });
});
