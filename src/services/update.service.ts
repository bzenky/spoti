import { spawn } from 'node:child_process';

import {
  FileUpdateCacheStore,
  type SuccessfulUpdateCheckCache,
  type UpdateCache,
  type UpdateCacheStore,
} from '../storage/update-cache.js';

export const SPOTI_PACKAGE_NAME = '@bzenky/spoti';
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org/%40bzenky%2Fspoti';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const UPDATE_CHECK_TIMEOUT_MS = 3_000;
export const UPDATE_COMMAND = 'npm install -g @bzenky/spoti@latest';

export type UpdateStatus = 'current' | 'update-available';
export type UpdateCheckSource = 'cache' | 'registry';

export interface UpdateCheckResult {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  checkedAt: number;
  source: UpdateCheckSource;
}

export interface UpdateChecker {
  checkInBackground(): Promise<UpdateCheckResult | null>;
}

export interface UpdateCommandRunner {
  run(command: string, args: readonly string[]): Promise<void>;
}

export interface UpdateServiceDependencies {
  cache?: UpdateCacheStore;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  timeoutMs?: number;
  checkIntervalMs?: number;
  commandRunner?: UpdateCommandRunner;
}

export class UpdateCheckError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpdateCheckError';
  }
}

export class UpdateInstallError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpdateInstallError';
  }
}

export class UpdateService implements UpdateChecker {
  private readonly cache: UpdateCacheStore;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly clock: () => number;
  private readonly timeoutMs: number;
  private readonly checkIntervalMs: number;
  private readonly commandRunner: UpdateCommandRunner;

  constructor(
    private readonly currentVersion: string,
    dependencies: UpdateServiceDependencies = {},
  ) {
    parseSemanticVersion(currentVersion);
    this.cache = dependencies.cache ?? new FileUpdateCacheStore();
    this.fetchImplementation = dependencies.fetch ?? globalThis.fetch;
    this.clock = dependencies.now ?? Date.now;
    this.timeoutMs = dependencies.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
    this.checkIntervalMs = dependencies.checkIntervalMs ?? UPDATE_CHECK_INTERVAL_MS;
    this.commandRunner = dependencies.commandRunner ?? new NodeUpdateCommandRunner();

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('Update check timeout must be a positive number.');
    }
    if (!Number.isFinite(this.checkIntervalMs) || this.checkIntervalMs <= 0) {
      throw new RangeError('Update check interval must be a positive number.');
    }
  }

  /** Always contacts npm and reports actionable failures. Intended for `spoti update --check`. */
  async checkForeground(): Promise<UpdateCheckResult> {
    const checkedAt = this.clock();
    try {
      const result = await this.fetchLatest(checkedAt);
      await this.cache.write(successCache(result));
      return result;
    } catch (error) {
      await this.recordFailedCheck(checkedAt);
      if (error instanceof UpdateCheckError) throw error;
      throw new UpdateCheckError(`Unable to check for updates: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  /** Uses the 24-hour cache and hides failures so normal commands remain unaffected. */
  async checkInBackground(): Promise<UpdateCheckResult | null> {
    const now = this.clock();
    try {
      const cached = await this.cache.read();
      if (cached && isFresh(cached.lastCheckedAt, now, this.checkIntervalMs)) {
        if (cached.lastFailedCheckAt === cached.lastCheckedAt) return null;
        if (cached.lastSuccessfulCheck?.currentVersion === this.currentVersion) {
          try {
            return resultFromSuccessfulCache(cached.lastSuccessfulCheck);
          } catch {
            // Invalid cached versions are recoverable; refresh them from the registry.
          }
        }
      }

      try {
        const result = await this.fetchLatest(now);
        await this.cache.write(successCache(result, cached));
        return result;
      } catch {
        await this.recordFailedCheck(now, cached);
        return null;
      }
    } catch {
      return null;
    }
  }

  /** The caller must obtain explicit user confirmation before setting `confirmed` to true. */
  async installLatest(confirmed: boolean, version: string): Promise<void> {
    if (!confirmed) {
      throw new UpdateInstallError(
        `Update not installed because confirmation is required. To update manually, run: ${UPDATE_COMMAND}`,
      );
    }

    try {
      parseSemanticVersion(version);
    } catch (error) {
      throw new UpdateInstallError(`Refusing to install invalid version ${JSON.stringify(version)}.`, {
        cause: error,
      });
    }

    try {
      await this.commandRunner.run('npm', [
        'install',
        '--global',
        `${SPOTI_PACKAGE_NAME}@${version}`,
      ]);
    } catch (error) {
      throw new UpdateInstallError(
        `Unable to install the latest spoti version: ${errorMessage(error)}\n\nRun manually: ${UPDATE_COMMAND}`,
        { cause: error },
      );
    }
  }

  private async fetchLatest(checkedAt: number): Promise<UpdateCheckResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();

    let response: Response;
    try {
      response = await this.fetchImplementation(NPM_REGISTRY_URL, {
        headers: { accept: 'application/vnd.npm.install-v1+json' },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new UpdateCheckError(
          `Update check timed out after ${this.timeoutMs}ms. Check your network connection and try again.`,
          { cause: error },
        );
      }
      throw new UpdateCheckError(
        `Unable to reach the npm registry: ${errorMessage(error)}. Check your network connection and try again.`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new UpdateCheckError(
        `The npm registry returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}. Try again later.`,
      );
    }

    let metadata: unknown;
    try {
      metadata = await response.json();
    } catch (error) {
      throw new UpdateCheckError(
        'The npm registry returned malformed JSON. Try again later or check the npm registry status.',
        { cause: error },
      );
    }

    const latestVersion = readLatestVersion(metadata);
    let comparison: number;
    try {
      comparison = compareSemanticVersions(latestVersion, this.currentVersion);
    } catch (error) {
      throw new UpdateCheckError(
        `The npm registry returned an invalid latest version (${JSON.stringify(latestVersion)}). Try again later.`,
        { cause: error },
      );
    }

    return {
      status: comparison > 0 ? 'update-available' : 'current',
      currentVersion: this.currentVersion,
      latestVersion,
      checkedAt,
      source: 'registry',
    };
  }

  private async recordFailedCheck(at: number, previous?: UpdateCache | null): Promise<void> {
    let cache = previous;
    if (cache === undefined) {
      try {
        cache = await this.cache.read();
      } catch {
        cache = null;
      }
    }

    await this.cache
      .write({
        version: 1,
        lastCheckedAt: at,
        ...(cache?.lastSuccessfulCheck
          ? { lastSuccessfulCheck: cache.lastSuccessfulCheck }
          : {}),
        lastFailedCheckAt: at,
      })
      .catch(() => undefined);
  }
}

export interface NodeUpdateCommandRunnerDependencies {
  platform?: NodeJS.Platform;
  spawn?: typeof spawn;
}

export class NodeUpdateCommandRunner implements UpdateCommandRunner {
  private readonly platform: NodeJS.Platform;
  private readonly spawnImplementation: typeof spawn;

  constructor(dependencies: NodeUpdateCommandRunnerDependencies = {}) {
    this.platform = dependencies.platform ?? process.platform;
    this.spawnImplementation = dependencies.spawn ?? spawn;
  }

  run(command: string, args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const executable = this.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
      const child = this.spawnImplementation(executable, [...args], {
        stdio: 'inherit',
        shell: false,
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            signal
              ? `npm was terminated by signal ${signal}`
              : `npm exited with status ${String(code)}`,
          ),
        );
      });
    });
  }
}

export function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);

  for (const key of ['major', 'minor', 'patch'] as const) {
    const comparison = compareNumericIdentifiers(leftVersion[key], rightVersion[key]);
    if (comparison !== 0) return comparison;
  }

  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return compareNumericIdentifiers(leftIdentifier, rightIdentifier);
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

interface SemanticVersion {
  major: string;
  minor: string;
  patch: string;
  prerelease?: readonly string[];
}

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseSemanticVersion(value: string): SemanticVersion {
  const match = SEMANTIC_VERSION_PATTERN.exec(value);
  if (!match) {
    throw new TypeError(`Invalid semantic version: ${JSON.stringify(value)}`);
  }
  const major = match[1];
  const minor = match[2];
  const patch = match[3];
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new TypeError(`Invalid semantic version: ${JSON.stringify(value)}`);
  }
  const prerelease = match[4];
  return {
    major,
    minor,
    patch,
    ...(prerelease === undefined ? {} : { prerelease: prerelease.split('.') }),
  };
}

function compareNumericIdentifiers(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function readLatestVersion(metadata: unknown): string {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('dist-tags' in metadata) ||
    typeof metadata['dist-tags'] !== 'object' ||
    metadata['dist-tags'] === null ||
    !('latest' in metadata['dist-tags']) ||
    typeof metadata['dist-tags'].latest !== 'string' ||
    metadata['dist-tags'].latest.length === 0
  ) {
    throw new UpdateCheckError(
      'The npm registry response did not include a latest version. Try again later.',
    );
  }
  return metadata['dist-tags'].latest;
}

function successCache(result: UpdateCheckResult, previous?: UpdateCache | null): UpdateCache {
  return {
    version: 1,
    lastCheckedAt: result.checkedAt,
    lastSuccessfulCheck: {
      checkedAt: result.checkedAt,
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
    },
    ...(previous?.lastFailedCheckAt === undefined
      ? {}
      : { lastFailedCheckAt: previous.lastFailedCheckAt }),
  };
}

function resultFromSuccessfulCache(cache: SuccessfulUpdateCheckCache): UpdateCheckResult {
  return {
    status:
      compareSemanticVersions(cache.latestVersion, cache.currentVersion) > 0
        ? 'update-available'
        : 'current',
    currentVersion: cache.currentVersion,
    latestVersion: cache.latestVersion,
    checkedAt: cache.checkedAt,
    source: 'cache',
  };
}

function isFresh(checkedAt: number, now: number, intervalMs: number): boolean {
  const age = now - checkedAt;
  return age >= 0 && age < intervalMs;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
