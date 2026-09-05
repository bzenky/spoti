import { Command } from 'commander';

import type { AuthService } from './services/auth.service.js';
import type { PlayerService } from './services/player.service.js';
import type { SearchService } from './services/search.service.js';
import { formatPlayback, formatTrack, type Output } from './ui/output.js';
import { selectTrack } from './ui/prompts.js';
import { VERSION } from './version.js';

export interface AppDependencies {
  auth: AuthService;
  player: PlayerService;
  search: SearchService;
  output: Output;
  chooseTrack?: typeof selectTrack;
}

export function createProgram(dependencies: AppDependencies): Command {
  const program = new Command();
  const chooseTrack = dependencies.chooseTrack ?? selectTrack;

  program
    .name('spoti')
    .description('Control Spotify from your terminal')
    .version(VERSION);

  program
    .command('login')
    .description('Log in to Spotify')
    .action(async () => {
      dependencies.output.log('Opening Spotify authorization in your browser…');
      const user = await dependencies.auth.login();
      dependencies.output.log(`✓ Logged in as ${user.displayName}`);
    });

  program
    .command('logout')
    .description('Remove locally stored Spotify credentials')
    .action(async () => {
      await dependencies.auth.logout();
      dependencies.output.log('✓ Logged out');
    });

  program
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      if (!(await dependencies.auth.isAuthenticated())) {
        dependencies.output.log('Not logged in.\n\nRun: spoti login');
        return;
      }
      const user = await dependencies.auth.getCurrentUser();
      dependencies.output.log(`✓ Logged in as ${user.displayName}`);
    });

  program
    .command('now')
    .description('Show the current Spotify playback')
    .action(async () => {
      const playback = await dependencies.player.getCurrentPlayback();
      dependencies.output.log(
        playback ? formatPlayback(playback) : 'Nothing is currently playing.',
      );
    });

  program
    .command('pause')
    .description('Pause playback')
    .action(async () => {
      await dependencies.player.pause();
      dependencies.output.log('⏸ Paused');
    });

  program
    .command('resume')
    .description('Resume playback')
    .action(async () => {
      await dependencies.player.resume();
      dependencies.output.log('▶ Resumed');
    });

  program
    .command('next')
    .alias('n')
    .description('Skip to the next track')
    .action(async () => {
      await dependencies.player.next();
      dependencies.output.log('⏭ Skipped to next track');
    });

  program
    .command('previous')
    .alias('prev')
    .description('Return to the previous track')
    .action(async () => {
      await dependencies.player.previous();
      dependencies.output.log('⏮ Returned to previous track');
    });

  program
    .command('search')
    .description('Search Spotify tracks')
    .argument('<query...>', 'track name to search for')
    .option('-l, --limit <number>', 'maximum number of results', parseLimit, 10)
    .action(async (queryParts: string[], options: { limit: number }) => {
      const query = queryParts.join(' ');
      const tracks = await dependencies.search.searchTracks(query, options.limit);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${query}".`);
        return;
      }
      dependencies.output.log(tracks.map((track, index) => formatTrack(track, index)).join('\n'));
    });

  program
    .command('play')
    .description('Search for and play a track, or resume with no query')
    .argument('[query...]', 'track name to search for')
    .option('--first', 'play the first search result without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        await dependencies.player.resume();
        dependencies.output.log('▶ Resumed');
        return;
      }

      const tracks = await dependencies.search.searchTracks(query);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${query}".`);
        return;
      }
      const track = options.first ? tracks[0] : await chooseTrack(tracks);
      if (!track) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      await dependencies.player.playTrack(track.uri);
      dependencies.output.log(`▶ Playing ${track.name} — ${track.artists.join(', ')}`);
    });

  return program;
}

function parseLimit(value: string): number {
  const limit = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Search limit must be an integer between 1 and 10.');
  }
  return limit;
}
