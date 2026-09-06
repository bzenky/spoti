import { spawn } from 'node:child_process';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UpdateService,
  type UpdateChecker,
  type UpdateCheckResult,
} from './services/update.service.js';

const WORKER_FLAG = '--spoti-update-worker';
const STALE_LOCK_MS = 60_000;

/** Automatic update failures are intentionally hidden from normal CLI commands. */
export async function runBackgroundUpdateCheck(
  checker: UpdateChecker,
): Promise<UpdateCheckResult | null> {
  try {
    return await checker.checkInBackground();
  } catch {
    return null;
  }
}

/**
 * Starts at most one independent refresh process. The process can finish after the invoking
 * CLI exits and writes the cache for a later invocation to display.
 */
export async function startUpdateWorker(
  currentVersion: string,
  cachePath: string,
): Promise<boolean> {
  const lockPath = `${cachePath}.lock`;
  if (!(await acquireUpdateWorkerLock(lockPath))) return false;

  const modulePath = fileURLToPath(import.meta.url);
  const runtimeArguments = modulePath.endsWith('.ts') ? process.execArgv : [];
  try {
    const child = spawn(
      process.execPath,
      [...runtimeArguments, modulePath, WORKER_FLAG, currentVersion, lockPath],
      {
        detached: true,
        stdio: 'ignore',
        shell: false,
      },
    );
    child.once('error', () => {
      void unlink(lockPath).catch(() => undefined);
    });
    child.unref();
    return true;
  } catch {
    await unlink(lockPath).catch(() => undefined);
    return false;
  }
}

export async function acquireUpdateWorkerLock(lockPath: string): Promise<boolean> {
  try {
    await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.close();
    return true;
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) return false;
  }

  try {
    const lock = await stat(lockPath);
    if (Date.now() - lock.mtimeMs < STALE_LOCK_MS) return false;
    await unlink(lockPath);
    const handle = await open(lockPath, 'wx', 0o600);
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

async function workerMain(currentVersion: string, lockPath: string): Promise<void> {
  try {
    await new UpdateService(currentVersion).checkForeground();
  } catch {
    // The foreground method records a failed timestamp; automatic checks remain silent.
  } finally {
    await unlink(lockPath).catch(() => undefined);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

if (process.argv[2] === WORKER_FLAG) {
  const currentVersion = process.argv[3];
  const lockPath = process.argv[4];
  if (currentVersion && lockPath) await workerMain(currentVersion, lockPath);
}
