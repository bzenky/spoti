import { mkdtemp, rm, unlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireUpdateWorkerLock } from '../src/update-worker.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('update worker lock', () => {
  it('allows only one active worker and recovers a stale lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'spoti-update-worker-'));
    directories.push(directory);
    const lockPath = join(directory, 'update-cache.json.lock');

    await expect(acquireUpdateWorkerLock(lockPath)).resolves.toBe(true);
    await expect(acquireUpdateWorkerLock(lockPath)).resolves.toBe(false);

    const staleDate = new Date(Date.now() - 61_000);
    await utimes(lockPath, staleDate, staleDate);
    await expect(acquireUpdateWorkerLock(lockPath)).resolves.toBe(true);

    await unlink(lockPath);
  });
});
