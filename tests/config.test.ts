import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationError } from '../src/utils/errors.js';
import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  FileConfigStore,
  parseConfigValue,
  type AppConfig,
} from '../src/storage/config.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'spoti-config-'));
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

describe('FileConfigStore', () => {
  it('returns defaults when the configuration file is missing', async () => {
    const store = new FileConfigStore({ directory: await createTemporaryDirectory() });

    expect(await store.read()).toEqual(DEFAULT_CONFIG);
    expect(CONFIG_KEYS).toEqual([
      'spotifyClientId',
      'watchAfterPlay',
      'refreshIntervalMs',
    ]);
  });

  it('merges defaults into an existing partial configuration', async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileConfigStore({ directory });
    await writeFile(store.path, JSON.stringify({ watchAfterPlay: true }));

    expect(await store.read()).toEqual({
      spotifyClientId: null,
      watchAfterPlay: true,
      refreshIntervalMs: 1_000,
    });
  });

  it('round-trips configuration with private directory and file permissions', async () => {
    const root = await createTemporaryDirectory();
    const directory = join(root, 'nested', 'spoti');
    const store = new FileConfigStore({ directory });
    const config: AppConfig = {
      spotifyClientId: 'client123',
      watchAfterPlay: true,
      refreshIntervalMs: 5_000,
    };

    await store.write(config);

    expect(await store.read()).toEqual(config);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(store.path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(store.path, 'utf8'))).toEqual(config);
  });

  it.each([
    ['malformed JSON', '{'],
    ['unknown keys', JSON.stringify({ watchAfterPlay: false, extra: true })],
    ['invalid values', JSON.stringify({ refreshIntervalMs: 999 })],
  ])('rejects files with %s', async (_description, contents) => {
    const directory = await createTemporaryDirectory();
    const store = new FileConfigStore({ directory });
    await writeFile(store.path, contents);

    await expect(store.read()).rejects.toBeInstanceOf(ConfigurationError);
  });

  it('sets one setting while preserving the others', async () => {
    const store = new FileConfigStore({ directory: await createTemporaryDirectory() });
    await store.write({
      spotifyClientId: 'client123',
      watchAfterPlay: false,
      refreshIntervalMs: 8_000,
    });

    await store.set('watchAfterPlay', true);

    expect(await store.read()).toEqual({
      spotifyClientId: 'client123',
      watchAfterPlay: true,
      refreshIntervalMs: 8_000,
    });
  });

  it('resets one key to its default while preserving other values', async () => {
    const store = new FileConfigStore({ directory: await createTemporaryDirectory() });
    await store.write({
      spotifyClientId: 'client123',
      watchAfterPlay: true,
      refreshIntervalMs: 8_000,
    });

    await store.resetKey('spotifyClientId');

    expect(await store.read()).toEqual({
      spotifyClientId: null,
      watchAfterPlay: true,
      refreshIntervalMs: 8_000,
    });
  });

  it('resets to defaults and is idempotent', async () => {
    const store = new FileConfigStore({ directory: await createTemporaryDirectory() });
    await store.write({
      spotifyClientId: null,
      watchAfterPlay: true,
      refreshIntervalMs: 10_000,
    });

    await store.reset();
    await store.reset();

    expect(await store.read()).toEqual(DEFAULT_CONFIG);
    await expect(access(store.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('repairs restrictive permissions on an existing configuration directory', async () => {
    const directory = await createTemporaryDirectory();
    await chmod(directory, 0o755);
    const store = new FileConfigStore({ directory });

    await store.write({ ...DEFAULT_CONFIG });

    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });
});

describe('parseConfigValue', () => {
  it('parses supported client ID, boolean, and interval values', () => {
    expect(parseConfigValue('spotifyClientId', '  client123  ')).toBe('client123');
    expect(parseConfigValue('watchAfterPlay', 'true')).toBe(true);
    expect(parseConfigValue('watchAfterPlay', 'false')).toBe(false);
    expect(parseConfigValue('refreshIntervalMs', '1000')).toBe(1_000);
    expect(parseConfigValue('refreshIntervalMs', '30000')).toBe(30_000);
  });

  it.each([
    ['spotifyClientId', ''],
    ['spotifyClientId', 'client id'],
    ['watchAfterPlay', 'yes'],
    ['watchAfterPlay', 'TRUE'],
    ['refreshIntervalMs', '999'],
    ['refreshIntervalMs', '30001'],
    ['refreshIntervalMs', '1000.5'],
    ['refreshIntervalMs', 'abc'],
  ] as const)('rejects invalid value %s=%s with a friendly error', (key, value) => {
    expect(() => parseConfigValue(key, value)).toThrow(ConfigurationError);
  });
});
