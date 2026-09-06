import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getConfigDirectory } from './credentials.js';

export interface SuccessfulUpdateCheckCache {
  checkedAt: number;
  currentVersion: string;
  latestVersion: string;
}

export interface UpdateCache {
  version: 1;
  lastCheckedAt: number;
  lastSuccessfulCheck?: SuccessfulUpdateCheckCache;
  lastFailedCheckAt?: number;
}

export interface UpdateCacheStore {
  read(): Promise<UpdateCache | null>;
  write(cache: UpdateCache): Promise<void>;
}

export interface FileUpdateCacheStoreOptions {
  directory?: string;
}

export class UpdateCacheError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpdateCacheError';
  }
}

export class FileUpdateCacheStore implements UpdateCacheStore {
  readonly path: string;
  private readonly directory: string;

  constructor(options: FileUpdateCacheStoreOptions = {}) {
    this.directory = options.directory ?? getConfigDirectory();
    this.path = join(this.directory, 'update-cache.json');
  }

  async read(): Promise<UpdateCache | null> {
    let contents: string;
    try {
      contents = await readFile(this.path, 'utf8');
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw new UpdateCacheError(`Unable to read the update cache: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    try {
      return parseUpdateCache(JSON.parse(contents) as unknown);
    } catch {
      // Cache data is disposable. Treat malformed or partially written data as a cache miss.
      return null;
    }
  }

  async write(cache: UpdateCache): Promise<void> {
    const validated = parseUpdateCache(cache);

    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await chmod(this.directory, 0o700);
    } catch (error) {
      throw new UpdateCacheError(`Unable to prepare the update cache directory: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    const temporaryPath = join(this.directory, `.update-cache-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.path);
      await chmod(this.path, 0o600);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new UpdateCacheError(`Unable to store the update cache: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }
}

export function parseUpdateCache(value: unknown): UpdateCache {
  if (!isRecord(value) || !hasOnlyKeys(value, CACHE_KEYS)) {
    throw new UpdateCacheError('The update cache has an invalid format.');
  }
  if (value.version !== 1 || !isTimestamp(value.lastCheckedAt)) {
    throw new UpdateCacheError('The update cache has an invalid format.');
  }

  const successful = parseSuccessfulCheck(value.lastSuccessfulCheck);
  const failedAt = value.lastFailedCheckAt;
  if (failedAt !== undefined && !isTimestamp(failedAt)) {
    throw new UpdateCacheError('The update cache has an invalid format.');
  }
  if (!successful && failedAt === undefined) {
    throw new UpdateCacheError('The update cache has an invalid format.');
  }

  const newestOutcomeAt = Math.max(successful?.checkedAt ?? -1, failedAt ?? -1);
  if (value.lastCheckedAt !== newestOutcomeAt) {
    throw new UpdateCacheError('The update cache has inconsistent timestamps.');
  }

  return {
    version: 1,
    lastCheckedAt: value.lastCheckedAt,
    ...(successful ? { lastSuccessfulCheck: successful } : {}),
    ...(failedAt === undefined ? {} : { lastFailedCheckAt: failedAt }),
  };
}

const CACHE_KEYS = new Set([
  'version',
  'lastCheckedAt',
  'lastSuccessfulCheck',
  'lastFailedCheckAt',
]);
const SUCCESS_KEYS = new Set(['checkedAt', 'currentVersion', 'latestVersion']);

function parseSuccessfulCheck(value: unknown): SuccessfulUpdateCheckCache | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, SUCCESS_KEYS) ||
    !isTimestamp(value.checkedAt) ||
    !isNonemptyString(value.currentVersion) ||
    !isNonemptyString(value.latestVersion)
  ) {
    throw new UpdateCacheError('The update cache has an invalid successful check.');
  }
  return {
    checkedAt: value.checkedAt,
    currentVersion: value.currentVersion,
    latestVersion: value.latestVersion,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFileNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
