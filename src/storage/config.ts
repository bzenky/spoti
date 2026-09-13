import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { ConfigurationError, toError } from '../utils/errors.js';
import { getConfigDirectory } from './credentials.js';

const spotifyClientIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9]+$/);

const configSchema = z.strictObject({
  spotifyClientId: spotifyClientIdSchema.nullable().default(null),
  defaultDevice: z.string().trim().min(1).max(256).nullable().default(null),
  watchAfterPlay: z.boolean().default(false),
  refreshIntervalMs: z.number().int().min(1_000).max(30_000).default(1_000),
});

export type AppConfig = z.infer<typeof configSchema>;

export const CONFIG_KEYS = [
  'spotifyClientId',
  'defaultDevice',
  'watchAfterPlay',
  'refreshIntervalMs',
] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export const DEFAULT_CONFIG: Readonly<AppConfig> = Object.freeze(configSchema.parse({}));

export interface ConfigStore {
  readonly path?: string;
  read(): Promise<AppConfig>;
  write(config: AppConfig): Promise<void>;
  set<Key extends ConfigKey>(key: Key, value: AppConfig[Key]): Promise<void>;
  resetKey<Key extends ConfigKey>(key: Key): Promise<void>;
  reset(): Promise<void>;
}

export interface FileConfigStoreOptions {
  directory?: string;
}

export class FileConfigStore implements ConfigStore {
  readonly path: string;
  private readonly directory: string;

  constructor(options: FileConfigStoreOptions = {}) {
    this.directory = options.directory ?? getConfigDirectory();
    this.path = join(this.directory, 'config.json');
  }

  async read(): Promise<AppConfig> {
    let contents: string;
    try {
      contents = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isFileNotFound(error)) return { ...DEFAULT_CONFIG };
      throw new ConfigurationError(
        `Unable to read application configuration: ${toError(error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch {
      throw new ConfigurationError('Application configuration is not valid JSON.');
    }

    const config = configSchema.safeParse(parsed);
    if (!config.success) {
      throw new ConfigurationError('Application configuration has an invalid format.');
    }
    return config.data;
  }

  async write(config: AppConfig): Promise<void> {
    const validated = configSchema.safeParse(config);
    if (!validated.success) {
      throw new ConfigurationError('Cannot store invalid application configuration.');
    }

    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700);
    } catch (error) {
      throw new ConfigurationError(
        `Unable to prepare the application configuration directory: ${toError(error).message}`,
      );
    }

    const temporaryPath = join(this.directory, `.config-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(validated.data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.path);
      await chmod(this.path, 0o600);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new ConfigurationError(
        `Unable to store application configuration: ${toError(error).message}`,
      );
    }
  }

  async set<Key extends ConfigKey>(key: Key, value: AppConfig[Key]): Promise<void> {
    const current = await this.read();
    await this.write({ ...current, [key]: value });
  }

  async resetKey<Key extends ConfigKey>(key: Key): Promise<void> {
    await this.set(key, DEFAULT_CONFIG[key]);
  }

  async reset(): Promise<void> {
    try {
      await unlink(this.path);
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw new ConfigurationError(
          `Unable to reset application configuration: ${toError(error).message}`,
        );
      }
    }
  }
}

export function parseConfigValue<Key extends ConfigKey>(
  key: Key,
  value: string,
): AppConfig[Key] {
  if (key === 'spotifyClientId') {
    const clientId = spotifyClientIdSchema.safeParse(value);
    if (clientId.success) return clientId.data as AppConfig[Key];
    throw new ConfigurationError(
      'Invalid Spotify client ID: expected a non-empty alphanumeric value.',
    );
  }

  if (key === 'defaultDevice') {
    const device = z.string().trim().min(1).max(256).safeParse(value);
    if (device.success) return device.data as AppConfig[Key];
    throw new ConfigurationError(
      'Invalid default device: expected a non-empty device name or ID.',
    );
  }

  if (key === 'watchAfterPlay') {
    if (value === 'true') return true as AppConfig[Key];
    if (value === 'false') return false as AppConfig[Key];
    throw new ConfigurationError(
      'Invalid value for watchAfterPlay: expected either "true" or "false".',
    );
  }

  if (key === 'refreshIntervalMs') {
    if (/^-?\d+$/.test(value)) {
      const interval = Number(value);
      if (Number.isSafeInteger(interval) && interval >= 1_000 && interval <= 30_000) {
        return interval as AppConfig[Key];
      }
    }
    throw new ConfigurationError(
      'Invalid value for refreshIntervalMs: expected an integer from 1000 to 30000.',
    );
  }

  throw new ConfigurationError(`Unknown configuration key: ${String(key)}.`);
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
