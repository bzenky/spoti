#!/usr/bin/env node

import { createProgram } from './app.js';
import { AuthService } from './services/auth.service.js';
import { PlayerService } from './services/player.service.js';
import { SearchService } from './services/search.service.js';
import { SpotifyClient } from './spotify/client.js';
import { consoleOutput } from './ui/output.js';
import { AppError, toError } from './utils/errors.js';

const auth = new AuthService();
const spotify = new SpotifyClient(auth);
const program = createProgram({
  auth,
  player: new PlayerService(spotify),
  search: new SearchService(spotify),
  output: consoleOutput,
});

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const normalizedError = toError(error);
  consoleOutput.error(normalizedError.message);
  process.exitCode = error instanceof AppError ? error.exitCode : 1;
}
