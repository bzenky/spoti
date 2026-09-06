#!/usr/bin/env node

import { createProgram } from './app.js';
import { AuthService } from './services/auth.service.js';
import { CatalogService } from './services/catalog.service.js';
import { DeviceService } from './services/device.service.js';
import { LibraryService } from './services/library.service.js';
import { PlayerService } from './services/player.service.js';
import { PlaylistService } from './services/playlist.service.js';
import { QueueService } from './services/queue.service.js';
import { RecentService } from './services/recent.service.js';
import { SearchService } from './services/search.service.js';
import {
  compareSemanticVersions,
  UPDATE_CHECK_INTERVAL_MS,
  UpdateService,
} from './services/update.service.js';
import { FileConfigStore } from './storage/config.js';
import { FileUpdateCacheStore, type UpdateCache } from './storage/update-cache.js';
import { SpotifyClient } from './spotify/client.js';
import { consoleOutput } from './ui/output.js';
import { startUpdateWorker } from './update-worker.js';
import { AppError, toError } from './utils/errors.js';
import { VERSION } from './version.js';

const auth = new AuthService();
const spotify = new SpotifyClient(auth);
const device = new DeviceService(spotify);
const updateCache = new FileUpdateCacheStore();
const update = new UpdateService(VERSION, { cache: updateCache });
const program = createProgram({
  auth,
  catalog: new CatalogService(spotify),
  device,
  library: new LibraryService(spotify),
  player: new PlayerService(spotify, device),
  playlist: new PlaylistService(spotify),
  queue: new QueueService(spotify),
  recent: new RecentService(spotify),
  search: new SearchService(spotify),
  update,
  config: new FileConfigStore(),
  output: consoleOutput,
});

const isUpdateCommand = process.argv[2] === 'update';
const cachedUpdate = isUpdateCommand ? null : await updateCache.read().catch(() => null);
const updateMessage = getCachedUpdateMessage(cachedUpdate, VERSION);
if (!isUpdateCommand && shouldRefreshUpdateCache(cachedUpdate, VERSION)) {
  await startUpdateWorker(VERSION, updateCache.path);
}

try {
  await program.parseAsync(process.argv);
  if (updateMessage && process.stderr.isTTY) {
    consoleOutput.error(updateMessage);
  }
} catch (error) {
  const normalizedError = toError(error);
  consoleOutput.error(normalizedError.message);
  process.exitCode = error instanceof AppError ? error.exitCode : 1;
}

function shouldRefreshUpdateCache(cache: UpdateCache | null, currentVersion: string): boolean {
  if (!cache) return true;
  const age = Date.now() - cache.lastCheckedAt;
  if (age < 0 || age >= UPDATE_CHECK_INTERVAL_MS) return true;
  return (
    cache.lastSuccessfulCheck !== undefined &&
    cache.lastSuccessfulCheck.currentVersion !== currentVersion
  );
}

function getCachedUpdateMessage(
  cache: UpdateCache | null,
  currentVersion: string,
): string | null {
  const successful = cache?.lastSuccessfulCheck;
  if (!successful || successful.currentVersion !== currentVersion) return null;
  if (cache?.lastFailedCheckAt === cache?.lastCheckedAt) return null;
  const age = Date.now() - successful.checkedAt;
  if (age < 0 || age >= UPDATE_CHECK_INTERVAL_MS) return null;
  try {
    if (compareSemanticVersions(successful.latestVersion, currentVersion) <= 0) return null;
  } catch {
    return null;
  }
  return [
    `Update available: ${currentVersion} → ${successful.latestVersion}`,
    'Run: spoti update',
  ].join('\n');
}
