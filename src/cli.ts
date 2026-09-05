#!/usr/bin/env node

import { createProgram } from './app.js';
import { AuthService } from './services/auth.service.js';
import { DeviceService } from './services/device.service.js';
import { PlayerService } from './services/player.service.js';
import { QueueService } from './services/queue.service.js';
import { SearchService } from './services/search.service.js';
import { FileConfigStore } from './storage/config.js';
import { SpotifyClient } from './spotify/client.js';
import { consoleOutput } from './ui/output.js';
import { AppError, toError } from './utils/errors.js';

const auth = new AuthService();
const spotify = new SpotifyClient(auth);
const device = new DeviceService(spotify);
const program = createProgram({
  auth,
  device,
  player: new PlayerService(spotify, device),
  queue: new QueueService(spotify),
  search: new SearchService(spotify),
  config: new FileConfigStore(),
  output: consoleOutput,
});

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const normalizedError = toError(error);
  consoleOutput.error(normalizedError.message);
  process.exitCode = error instanceof AppError ? error.exitCode : 1;
}
