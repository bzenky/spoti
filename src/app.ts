import { Command } from 'commander';

import type { AuthService } from './services/auth.service.js';
import type { CatalogService } from './services/catalog.service.js';
import type { DeviceService } from './services/device.service.js';
import type { LibraryService } from './services/library.service.js';
import type {
  Album,
  Artist,
  Playlist,
  RecentlyPlayedTrack,
  SavedTrack,
  SpotifyContextType,
  Track,
} from './services/models.js';
import type { PlayerService } from './services/player.service.js';
import type { PlaylistService } from './services/playlist.service.js';
import type { OffsetToken, Page, RecentCursorToken } from './services/pagination.js';
import type { QueueService } from './services/queue.service.js';
import type { RecentService } from './services/recent.service.js';
import type { SearchService } from './services/search.service.js';
import {
  UPDATE_COMMAND,
  type UpdateService,
} from './services/update.service.js';
import {
  CONFIG_KEYS,
  parseConfigValue,
  type ConfigKey,
  type ConfigStore,
} from './storage/config.js';
import {
  formatAlbum,
  formatAlbumDetail,
  formatArtistDetail,
  formatPlayback,
  formatPlaylist,
  formatPlaylistOverview,
  formatRecentlyPlayed,
  formatSavedTrack,
  formatTrack,
  plainOutputStyles,
  sanitizeOneLineText,
  type Output,
  type OutputStyles,
} from './ui/output.js';
import {
  confirmUpdate,
  promptSpotifyClientId,
  selectAlbum,
  selectAlbumAction,
  selectArtist,
  selectArtistAction,
  selectPageAction,
  selectPlaylist,
  selectPlaylistAction,
  selectTrack,
} from './ui/prompts.js';
import { generateCompletionScript, type CompletionShell } from './ui/completions.js';
import { withProgress, type ProgressRunner } from './ui/progress.js';
import {
  runInteractiveSearch,
  type InteractiveSearchResult,
} from './ui/interactive-search.js';
import {
  createPageBrowser,
  type PageActionPrompt,
  type PageView,
} from './ui/pagination.js';
import { watchPlayback, type PlaybackWatcher } from './ui/watch.js';
import { ConfigurationError } from './utils/errors.js';
import { formatDuration } from './utils/time.js';
import { VERSION } from './version.js';

export interface AppDependencies {
  auth: AuthService;
  catalog: CatalogService;
  player: PlayerService;
  search: SearchService;
  playlist: PlaylistService;
  library: LibraryService;
  recent: RecentService;
  device: DeviceService;
  queue: QueueService;
  update: UpdateService;
  config: ConfigStore;
  output: Output;
  chooseTrack?: typeof selectTrack;
  chooseAlbum?: typeof selectAlbum;
  chooseArtist?: typeof selectArtist;
  choosePlaylist?: typeof selectPlaylist;
  choosePageAction?: typeof selectPageAction;
  chooseAlbumAction?: typeof selectAlbumAction;
  chooseArtistAction?: typeof selectArtistAction;
  choosePlaylistAction?: typeof selectPlaylistAction;
  requestSpotifyClientId?: typeof promptSpotifyClientId;
  confirmUpdate?: typeof confirmUpdate;
  interactiveSearch?: () => Promise<InteractiveSearchResult>;
  progress?: ProgressRunner;
  styles?: OutputStyles;
  watchPlayback?: PlaybackWatcher;
}

export function createProgram(dependencies: AppDependencies): Command {
  const program = new Command();
  const chooseTrack = dependencies.chooseTrack ?? selectTrack;
  const chooseAlbum = dependencies.chooseAlbum ?? selectAlbum;
  const chooseArtist = dependencies.chooseArtist ?? selectArtist;
  const choosePlaylist = dependencies.choosePlaylist ?? selectPlaylist;
  const choosePageAction = dependencies.choosePageAction ?? selectPageAction;
  const chooseAlbumAction = dependencies.chooseAlbumAction ?? selectAlbumAction;
  const chooseArtistAction = dependencies.chooseArtistAction ?? selectArtistAction;
  const choosePlaylistAction = dependencies.choosePlaylistAction ?? selectPlaylistAction;
  const requestClientId = dependencies.requestSpotifyClientId ?? promptSpotifyClientId;
  const requestUpdateConfirmation = dependencies.confirmUpdate ?? confirmUpdate;
  const styles = dependencies.styles ?? plainOutputStyles;
  const safe = sanitizeOneLineText;
  const safeArtists = (artists: string[]): string => artists.map(safe).join(', ');
  const startInteractiveSearch =
    dependencies.interactiveSearch ??
    (() =>
      runInteractiveSearch({
        search: dependencies.search,
        player: dependencies.player,
        styles,
      }));
  const showProgress = dependencies.progress ?? withProgress;
  const runTask = <Result>(label: string, task: () => Promise<Result>): Promise<Result> =>
    showProgress(label, task);
  const startWatching = dependencies.watchPlayback ?? watchPlayback;
  const createCollectionBrowser = <Item, Token>(options: {
    title: string;
    loadPage(token?: Token): Promise<Page<Item, Token>>;
    formatItem(item: Item, index: number): string;
    emptyAction?: string;
  }) =>
    createPageBrowser({
      loadPage: options.loadPage,
      renderPage: (view) => {
        dependencies.output.log(formatCollectionPage(options.title, view, options.formatItem, styles));
      },
      chooseAction: ((view) =>
        choosePageAction(view, {
          emptyAction: options.emptyAction ?? 'keep current playback',
        })) as PageActionPrompt<Item>,
    });

  const runAlbumAction = async (
    album: Album,
    options: { allowBack?: boolean } = {},
  ): Promise<'back' | 'finished'> => {
    const detail = await runTask('Loading album…', () =>
      dependencies.catalog.getAlbum(album.id),
    );
    dependencies.output.log(formatAlbumDetail(detail, styles));
    const action = await chooseAlbumAction(options);
    if (action === 'back') return 'back';
    if (action === 'play-album') {
      await dependencies.player.playContext(detail.uri);
      dependencies.output.log(`▶ Playing album ${safe(detail.name)}`);
      return 'finished';
    }
    if (action === 'play-track') {
      const track = await chooseTrack(detail.tracks);
      if (!track) return 'finished';
      await dependencies.player.playTrack(track.uri);
      dependencies.output.log(`▶ Playing ${safe(track.name)} — ${safeArtists(track.artists)}`);
    }
    return 'finished';
  };

  program
    .name('spoti')
    .description('Control Spotify from your terminal')
    .version(VERSION)
    .allowExcessArguments()
    .action(() => {
      const unknownCommand = program.args[0];
      if (unknownCommand) {
        throw new ConfigurationError(
          `Unknown command "${sanitizeOneLineText(unknownCommand)}".\n\nRun: spoti --help`,
        );
      }
      program.outputHelp();
    });

  const interactiveCommand = program
    .command('interactive')
    .alias('i')
    .description('Open the keyboard-driven Spotify search')
    .action(async () => {
      const result = await startInteractiveSearch();
      if (result.status === 'not-interactive') interactiveCommand.outputHelp();
      else if (result.status === 'played') {
        dependencies.output.log(`▶ Playing ${styles.name(safe(result.label))}`);
      }
    });

  program
    .command('setup')
    .description('Save your Spotify application client ID')
    .argument('[client-id]', 'Spotify application client ID')
    .action(async (providedClientId?: string) => {
      const clientId = providedClientId ?? (await requestClientId());
      if (!clientId) {
        throw new ConfigurationError(
          'A Spotify client ID is required.\n\nRun: spoti setup <client-id>',
        );
      }
      const validatedClientId = parseConfigValue('spotifyClientId', clientId);
      await dependencies.config.set('spotifyClientId', validatedClientId);
      dependencies.output.log('✓ Spotify client ID saved.\n\nNext: spoti login');
    });

  program
    .command('login')
    .description('Log in to Spotify')
    .action(async () => {
      dependencies.output.log('Opening Spotify authorization in your browser…');
      const user = await dependencies.auth.login();
      dependencies.output.log(`✓ Logged in as ${safe(user.displayName)}`);
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
      dependencies.output.log(`✓ Logged in as ${safe(user.displayName)}`);
    });

  const configCommand = program
    .command('config')
    .description('View and update spoti configuration')
    .action(async () => {
      const config = await dependencies.config.read();
      dependencies.output.log(formatConfig(config));
    });

  configCommand
    .command('get')
    .description('Read a configuration value')
    .argument('<key>', 'configuration key')
    .action(async (keyName: string) => {
      const key = parseConfigKey(keyName);
      const config = await dependencies.config.read();
      dependencies.output.log(String(config[key]));
    });

  configCommand
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'configuration key')
    .argument('<value>', 'new value')
    .action(async (keyName: string, rawValue: string) => {
      const key = parseConfigKey(keyName);
      const value = parseConfigValue(key, rawValue);
      await dependencies.config.set(key, value);
      dependencies.output.log(`✓ ${key} = ${String(value)}`);
    });

  configCommand
    .command('unset')
    .description('Reset one configuration value to its default')
    .argument('<key>', 'configuration key')
    .action(async (keyName: string) => {
      const key = parseConfigKey(keyName);
      await dependencies.config.resetKey(key);
      dependencies.output.log(`✓ ${key} reset`);
    });

  configCommand
    .command('path')
    .description('Print the configuration file path')
    .action(() => {
      if (!dependencies.config.path) {
        throw new ConfigurationError('The active configuration store has no file path.');
      }
      dependencies.output.log(dependencies.config.path);
    });

  configCommand
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      await dependencies.config.reset();
      dependencies.output.log('✓ Configuration reset');
    });

  program
    .command('now')
    .alias('np')
    .description('Show the current Spotify playback')
    .option('-w, --watch', 'continuously refresh playback information')
    .action(async (options: { watch?: boolean }) => {
      if (options.watch) {
        const config = await dependencies.config.read();
        await startWatching({
          player: dependencies.player,
          refreshIntervalMs: config.refreshIntervalMs,
        });
        return;
      }
      const playback = await dependencies.player.getCurrentPlayback();
      dependencies.output.log(
        playback ? formatPlayback(playback, styles) : 'Nothing is currently playing.',
      );
    });

  program
    .command('pause')
    .alias('pa')
    .description('Pause playback')
    .action(async () => {
      await dependencies.player.pause();
      dependencies.output.log('⏸ Paused');
    });

  program
    .command('resume')
    .alias('r')
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
    .command('devices')
    .alias('devs')
    .description('List available Spotify Connect devices')
    .action(async () => {
      const devices = await runTask('Loading devices…', () =>
        dependencies.device.getDevices(),
      );
      const formatted =
        devices.length === 0
          ? 'No Spotify devices are available. Open Spotify on a device and try again.'
          : devices
              .map((device, index) => {
                const state = device.isActive
                  ? 'active'
                  : device.isRestricted
                    ? 'restricted'
                    : 'available';
                const volume =
                  device.volumePercent === null ? '' : ` · ${device.volumePercent}%`;
                const name = styles.name(sanitizeOneLineText(device.name));
                const metadata = styles.metadata(
                  `${sanitizeOneLineText(device.type)} · ${state}${volume}`,
                );
                return `${index + 1}. ${name} · ${metadata}`;
              })
              .join('\n');
      dependencies.output.log(formatted);
    });

  program
    .command('device')
    .alias('dev')
    .description('Transfer playback to a Spotify Connect device')
    .argument('<number-name-or-id...>', 'displayed number, exact device name, or ID')
    .action(async (nameOrIdParts: string[]) => {
      const device = await dependencies.device.findDevice(nameOrIdParts.join(' '));
      if (!device.id) throw new ConfigurationError('The selected device has no usable ID.');
      await dependencies.device.transferPlayback(device.id);
      dependencies.output.log(`✓ Active device: ${safe(device.name)}`);
    });

  program
    .command('seek')
    .alias('sk')
    .description('Seek within the current track')
    .argument('<position>', 'absolute time such as 1:30, or a change such as +30 or -10')
    .allowUnknownOption()
    .action(async (rawPosition: string) => {
      const input = parseSeekInput(rawPosition);
      const position = input.relative
        ? await dependencies.player.changePosition(input.milliseconds)
        : await dependencies.player.seek(input.milliseconds);
      dependencies.output.log(`⏩ Position: ${formatDuration(position)}`);
    });

  program
    .command('volume')
    .alias('vol')
    .description('Show, set, or adjust the active device volume')
    .argument('[value]', 'volume from 0-100, or a relative change such as +10 or -10')
    .allowUnknownOption()
    .action(async (rawValue?: string) => {
      const volume =
        rawValue === undefined
          ? await dependencies.player.getVolume()
          : await applyVolumeInput(dependencies.player, parseVolumeInput(rawValue));
      dependencies.output.log(`${volume === 0 ? '🔇' : '🔊'} Volume: ${volume}%`);
    });

  program
    .command('queue')
    .alias('q')
    .description('Show the playback queue or add a searched track')
    .argument('[query...]', 'track name to add')
    .option('--first', 'queue the first search result without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        const playbackQueue = await runTask('Loading queue…', () =>
          dependencies.queue.getQueue(),
        );
        const lines = playbackQueue.currentlyPlaying
          ? [
              `${styles.heading('Now:')} ${formatQueueItem(playbackQueue.currentlyPlaying, styles)}`,
              '',
              styles.heading('Up next:'),
            ]
          : [styles.heading('Up next:')];
        if (playbackQueue.queue.length === 0) lines.push('Queue is empty.');
        else {
          lines.push(
            ...playbackQueue.queue.map(
              (item, index) => `${index + 1}. ${formatQueueItem(item, styles)}`,
            ),
          );
        }
        dependencies.output.log(lines.join('\n'));
        return;
      }

      const tracks = await dependencies.search.searchTracks(query);
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${safe(query)}".`);
        return;
      }
      const track = options.first ? tracks[0] : await chooseTrack(tracks);
      if (!track) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      await dependencies.queue.addItem(track.uri);
      dependencies.output.log(`✓ Queued ${safe(track.name)} — ${safeArtists(track.artists)}`);
    });

  program
    .command('shuffle')
    .description('Show or change the playback shuffle state')
    .argument('[state]', 'on or off')
    .action(async (state?: string) => {
      if (state === undefined) {
        const enabled = await dependencies.player.getShuffleState();
        dependencies.output.log(`🔀 Shuffle: ${enabled ? 'on' : 'off'}`);
        return;
      }
      if (state !== 'on' && state !== 'off') {
        throw new ConfigurationError('Shuffle state must be either "on" or "off".');
      }
      await dependencies.player.setShuffle(state === 'on');
      dependencies.output.log(`✓ Shuffle ${state}`);
    });

  program
    .command('repeat')
    .alias('rep')
    .description('Show or change the playback repeat mode')
    .argument('[mode]', 'off, track, or context')
    .action(async (mode?: string) => {
      if (mode === undefined) {
        const currentMode = await dependencies.player.getRepeatState();
        dependencies.output.log(`🔁 Repeat: ${currentMode}`);
        return;
      }
      if (mode !== 'off' && mode !== 'track' && mode !== 'context') {
        throw new ConfigurationError('Repeat mode must be "off", "track", or "context".');
      }
      await dependencies.player.setRepeat(mode);
      dependencies.output.log(`✓ Repeat: ${mode}`);
    });

  program
    .command('album')
    .alias('alb')
    .description('Search for and show an album')
    .argument('<query...>', 'album name')
    .option('--first', 'select the first result without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      const albums = await runTask('Searching albums…', () =>
        dependencies.search.searchAlbums(query),
      );
      if (albums.length === 0) {
        dependencies.output.log(`No albums found for "${safe(query)}".`);
        return;
      }
      const album = options.first ? albums[0] : await chooseAlbum(albums);
      if (!album) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      await runAlbumAction(album);
    });

  program
    .command('artist')
    .alias('art')
    .description('Search for and show an artist')
    .argument('<query...>', 'artist name')
    .option('--first', 'select the first result without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      const artists = await runTask('Searching artists…', () =>
        dependencies.search.searchArtists(query),
      );
      if (artists.length === 0) {
        dependencies.output.log(`No artists found for "${safe(query)}".`);
        return;
      }
      const artist = options.first ? artists[0] : await chooseArtist(artists);
      if (!artist) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      const detail = await runTask('Loading artist…', () =>
        dependencies.catalog.getArtist(artist.id),
      );
      dependencies.output.log(formatArtistDetail(detail, styles));
      let albumBrowser: { select(): Promise<Album | null> } | undefined;
      while (true) {
        const action = await chooseArtistAction();
        if (!action) return;
        if (action === 'play-artist') {
          await dependencies.player.playContext(detail.uri);
          dependencies.output.log(`▶ Playing artist ${safe(detail.name)}`);
          return;
        }

        albumBrowser ??= createCollectionBrowser<Album, OffsetToken>({
          title: `${safe(detail.name)} albums`,
          loadPage: (token) =>
            runTask('Loading artist albums…', () =>
              dependencies.catalog.getArtistAlbumsPage(detail.id, token, 10),
            ),
          formatItem: (album, index) => formatAlbum(album, index, styles),
          emptyAction: 'go back',
        });

        while (true) {
          const album = await albumBrowser.select();
          if (!album) break;
          const result = await runAlbumAction(album, { allowBack: true });
          if (result === 'finished') return;
        }
      }
    });

  program
    .command('playlists')
    .alias('pls')
    .description('Browse and optionally play your Spotify playlists')
    .option('-l, --limit <number>', 'number of playlists per page', parseCollectionLimit, 20)
    .action(async (options: { limit: number }) => {
      const browser = createCollectionBrowser<Playlist, OffsetToken>({
        title: 'Playlists',
        loadPage: (token) =>
          runTask('Loading playlists…', () =>
            dependencies.playlist.listPlaylistsPage(token, options.limit),
          ),
        formatItem: (playlist, index) => formatPlaylist(playlist, index, styles),
      });
      const selected = await browser.select();
      if (!selected) return;
      await dependencies.player.playContext(selected.uri);
      dependencies.output.log(`▶ Playing playlist ${safe(selected.name)}`);
    });

  program
    .command('playlist')
    .alias('pl')
    .description('Show one of your Spotify playlists')
    .argument('<query...>', 'playlist name')
    .option('--first', 'select the first match without prompting')
    .action(async (queryParts: string[], options: { first?: boolean }) => {
      const query = queryParts.join(' ').trim();
      let playlist: Playlist | null | undefined;
      if (/^\d+$/.test(query)) {
        playlist = await runTask('Loading playlist…', () =>
          dependencies.playlist.getPlaylistByNumber(Number(query)),
        );
        if (!playlist) throw playlistNumberOutOfRange(query);
      } else {
        const allPlaylists = await runTask('Loading playlists…', () =>
          dependencies.playlist.listPlaylists(50),
        );
        const matches = allPlaylists.filter((playlist) =>
          playlist.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        );
        if (matches.length === 0) {
          dependencies.output.log(`No playlists found for "${safe(query)}".`);
          return;
        }
        playlist = options.first ? matches[0] : await choosePlaylist(matches);
      }
      if (!playlist) {
        dependencies.output.log('Selection cancelled.');
        return;
      }
      dependencies.output.log(formatPlaylistOverview(playlist, styles));
      const action = await choosePlaylistAction();
      if (action === 'play-playlist') {
        await dependencies.player.playContext(playlist.uri);
        dependencies.output.log(`▶ Playing playlist ${safe(playlist.name)}`);
        return;
      }
      if (action === 'select-track') {
        const browser = createCollectionBrowser<Track, OffsetToken>({
          title: `${safe(playlist.name)} tracks`,
          loadPage: (token) =>
            runTask('Loading playlist tracks…', () =>
              dependencies.playlist.getPlaylistItemsPage(playlist.id, token, 50),
            ),
          formatItem: (track, index) => formatTrack(track, index, styles),
        });
        const track = await browser.select();
        if (!track) return;
        await dependencies.player.playTrack(track.uri);
        dependencies.output.log(
          `▶ Playing ${safe(track.name)} — ${safeArtists(track.artists)}`,
        );
      }
    });

  program
    .command('liked')
    .description('Browse and optionally play your liked tracks')
    .option('-l, --limit <number>', 'number of tracks per page', parseCollectionLimit, 20)
    .action(async (options: { limit: number }) => {
      const browser = createCollectionBrowser<SavedTrack, OffsetToken>({
        title: 'Liked tracks',
        loadPage: (token) =>
          runTask('Loading liked tracks…', () =>
            dependencies.library.getLikedTracksPage(token, options.limit),
          ),
        formatItem: (item, index) => formatSavedTrack(item, index, styles),
      });
      const selected = await browser.select();
      if (!selected) return;
      await dependencies.player.playTrack(selected.track.uri);
      dependencies.output.log(
        `▶ Playing ${safe(selected.track.name)} — ${safeArtists(selected.track.artists)}`,
      );
    });

  program
    .command('like')
    .description('Add the current track to your Spotify library')
    .action(async () => {
      const track = await dependencies.library.likeCurrentTrack();
      dependencies.output.log(
        track
          ? `♥ Liked ${safe(track.name)} — ${safeArtists(track.artists)}`
          : 'No playable track is currently selected.',
      );
    });

  program
    .command('unlike')
    .description('Remove the current track from your Spotify library')
    .action(async () => {
      const track = await dependencies.library.unlikeCurrentTrack();
      dependencies.output.log(
        track
          ? `♡ Unliked ${safe(track.name)} — ${safeArtists(track.artists)}`
          : 'No playable track is currently selected.',
      );
    });

  program
    .command('recent')
    .alias('rec')
    .description('Browse and optionally play recently played tracks')
    .option('-l, --limit <number>', 'number of tracks per page', parseCollectionLimit, 20)
    .action(async (options: { limit: number }) => {
      const browser = createCollectionBrowser<RecentlyPlayedTrack, RecentCursorToken>({
        title: 'Recently played',
        loadPage: (token) =>
          runTask('Loading recent tracks…', () =>
            dependencies.recent.getRecentlyPlayedPage(token, options.limit),
          ),
        formatItem: (item, index) => formatRecentlyPlayed(item, index, styles),
      });
      const selected = await browser.select();
      if (!selected) return;
      await dependencies.player.playTrack(selected.track.uri);
      dependencies.output.log(
        `▶ Playing ${safe(selected.track.name)} — ${safeArtists(selected.track.artists)}`,
      );
    });

  program
    .command('update')
    .description('Check for or install the latest spoti version')
    .option('--check', 'check without installing')
    .action(async (options: { check?: boolean }) => {
      const result = await dependencies.update.checkForeground();
      if (result.status === 'current') {
        dependencies.output.log(`✓ spoti ${result.currentVersion} is up to date.`);
        return;
      }

      dependencies.output.log(
        `Update available: ${result.currentVersion} → ${result.latestVersion}`,
      );
      if (options.check) {
        dependencies.output.log(`Run: ${UPDATE_COMMAND}`);
        return;
      }

      const confirmed = await requestUpdateConfirmation(
        result.currentVersion,
        result.latestVersion,
      );
      if (!confirmed) {
        dependencies.output.log(`Update cancelled.\nRun manually: ${UPDATE_COMMAND}`);
        return;
      }
      await dependencies.update.installLatest(true, result.latestVersion);
      dependencies.output.log(`✓ Updated spoti to ${result.latestVersion}.`);
    });

  program
    .command('completion')
    .description('Generate a shell completion script')
    .argument('<shell>', 'bash, zsh, or fish')
    .action((shellName: string) => {
      dependencies.output.log(generateCompletionScript(parseCompletionShell(shellName)));
    });

  program
    .command('search')
    .alias('s')
    .description('Search Spotify tracks')
    .argument('<query...>', 'track name to search for')
    .option('-l, --limit <number>', 'maximum number of results', parseLimit, 10)
    .action(async (queryParts: string[], options: { limit: number }) => {
      const query = queryParts.join(' ');
      const tracks = await runTask('Searching tracks…', () =>
        dependencies.search.searchTracks(query, options.limit),
      );
      if (tracks.length === 0) {
        dependencies.output.log(`No tracks found for "${safe(query)}".`);
        return;
      }
      dependencies.output.log(
        tracks.map((track, index) => formatTrack(track, index, styles)).join('\n'),
      );
    });

  program
    .command('play')
    .alias('p')
    .description('Play a track or an explicit album, artist, or playlist context')
    .argument('[query...]', 'track query, or: track|album|artist|playlist <query>')
    .option('--first', 'play the first search result without prompting')
    .option('--watch', 'continuously refresh playback information')
    .option('--no-watch', 'return to the shell after starting playback')
    .action(async (queryParts: string[], options: { first?: boolean; watch?: boolean }) => {
      const query = queryParts.join(' ').trim();
      if (!query) {
        const config = await dependencies.config.read();
        const shouldWatch = options.watch ?? config.watchAfterPlay;
        await dependencies.player.resume();
        dependencies.output.log('▶ Resumed');
        if (shouldWatch) {
          await startWatching({
            player: dependencies.player,
            refreshIntervalMs: config.refreshIntervalMs,
          });
        }
        return;
      }

      const firstPart = queryParts[0];
      const hasExplicitType = queryParts.length > 1 && isSpotifyPlayableType(firstPart);
      const explicitType = hasExplicitType ? firstPart : 'track';
      const searchQuery = hasExplicitType ? queryParts.slice(1).join(' ').trim() : query;
      const selection = await selectPlaybackItem({
        type: explicitType,
        query: searchQuery,
        first: options.first ?? false,
        dependencies,
        chooseTrack,
        chooseAlbum,
        chooseArtist,
        choosePlaylist,
        runTask,
      });
      if (!selection) return;

      const config = await dependencies.config.read();
      const shouldWatch = options.watch ?? config.watchAfterPlay;
      if (selection.type === 'track') await dependencies.player.playTrack(selection.uri);
      else await dependencies.player.playContext(selection.uri);
      dependencies.output.log(`▶ Playing ${safe(selection.label)}`);
      if (shouldWatch) {
        await startWatching({
          player: dependencies.player,
          refreshIntervalMs: config.refreshIntervalMs,
        });
      }
    });

  return program;
}

function formatCollectionPage<Item>(
  title: string,
  view: PageView<Item>,
  formatItem: (item: Item, index: number) => string,
  styles: OutputStyles,
): string {
  const range =
    view.items.length === 0
      ? ''
      : ` · ${view.startIndex + 1}-${view.startIndex + view.items.length}${view.total === undefined ? '' : ` of ${view.total}`}`;
  const items =
    view.items.length === 0
      ? ['No playable items on this page.']
      : view.items.map((item, index) => formatItem(item, view.startIndex + index));
  return [styles.heading(`${title} — page ${view.pageNumber}${range}`), '', ...items, ''].join(
    '\n',
  );
}


interface PlaybackSelection {
  type: 'track' | SpotifyContextType;
  uri: string;
  label: string;
}

interface SelectPlaybackItemOptions {
  type: 'track' | SpotifyContextType;
  query: string;
  first: boolean;
  dependencies: AppDependencies;
  chooseTrack: typeof selectTrack;
  chooseAlbum: typeof selectAlbum;
  chooseArtist: typeof selectArtist;
  choosePlaylist: typeof selectPlaylist;
  runTask: <Result>(label: string, task: () => Promise<Result>) => Promise<Result>;
}

async function selectPlaybackItem(
  options: SelectPlaybackItemOptions,
): Promise<PlaybackSelection | null> {
  const { dependencies, first, query } = options;
  let selected: TrackSelection | null | undefined;

  if (options.type === 'track') {
    const items = await options.runTask('Searching tracks…', () =>
      dependencies.search.searchTracks(query),
    );
    if (items.length === 0) {
      return reportNoResults(dependencies.output, 'tracks', query);
    }
    selected = first ? items[0] : await options.chooseTrack(items);
  } else if (options.type === 'album') {
    const items = await options.runTask('Searching albums…', () =>
      dependencies.search.searchAlbums(query),
    );
    if (items.length === 0) {
      return reportNoResults(dependencies.output, 'albums', query);
    }
    selected = first ? items[0] : await options.chooseAlbum(items);
  } else if (options.type === 'artist') {
    const items = await options.runTask('Searching artists…', () =>
      dependencies.search.searchArtists(query),
    );
    if (items.length === 0) {
      return reportNoResults(dependencies.output, 'artists', query);
    }
    selected = first ? items[0] : await options.chooseArtist(items);
  } else {
    if (/^\d+$/.test(query)) {
      selected = await options.runTask('Loading playlist…', () =>
        dependencies.playlist.getPlaylistByNumber(Number(query)),
      );
      if (!selected) throw playlistNumberOutOfRange(query);
    } else {
      const items = await options.runTask('Searching playlists…', () =>
        dependencies.search.searchPlaylists(query),
      );
      if (items.length === 0) {
        return reportNoResults(dependencies.output, 'playlists', query);
      }
      selected = first ? items[0] : await options.choosePlaylist(items);
    }
  }

  if (!selected) {
    dependencies.output.log('Selection cancelled.');
    return null;
  }
  if (options.type === 'track') {
    const track = selected as Track;
    return {
      type: 'track',
      uri: track.uri,
      label: `${sanitizeOneLineText(track.name)} — ${track.artists.map(sanitizeOneLineText).join(', ')}`,
    };
  }
  return {
    type: options.type,
    uri: selected.uri,
    label: sanitizeOneLineText(selected.name),
  };
}

type TrackSelection = Track | Album | Artist | Playlist;

function playlistNumberOutOfRange(number: string): ConfigurationError {
  return new ConfigurationError(
    `Playlist number ${number} is out of range. Run: spoti playlists`,
  );
}

function reportNoResults(
  output: Output,
  type: 'tracks' | 'albums' | 'artists' | 'playlists',
  query: string,
): null {
  output.log(`No ${type} found for "${sanitizeOneLineText(query)}".`);
  return null;
}

function isSpotifyPlayableType(
  value: string | undefined,
): value is 'track' | SpotifyContextType {
  return value === 'track' || value === 'album' || value === 'artist' || value === 'playlist';
}

async function applyVolumeInput(
  player: Pick<PlayerService, 'changeVolume' | 'setVolume'>,
  input: VolumeInput,
): Promise<number> {
  return input.relative ? player.changeVolume(input.value) : player.setVolume(input.value);
}

interface SeekInput {
  relative: boolean;
  milliseconds: number;
}

function parseSeekInput(value: string): SeekInput {
  const relative = value.startsWith('+') || value.startsWith('-');
  const sign = value.startsWith('-') ? -1 : 1;
  const time = relative ? value.slice(1) : value;
  const parts = time.split(':');
  if (parts.length > 2 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new ConfigurationError(
      'Seek position must be seconds or minutes:seconds, such as 90, 1:30, +30, or -10.',
    );
  }

  const minutes = parts.length === 2 ? Number(parts[0]) : 0;
  const seconds = Number(parts.at(-1));
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(seconds) || seconds >= 60 && parts.length === 2) {
    throw new ConfigurationError(
      'Seek position must be seconds or minutes:seconds, such as 90, 1:30, +30, or -10.',
    );
  }
  return {
    relative,
    milliseconds: sign * (minutes * 60 + seconds) * 1_000,
  };
}

function formatQueueItem(
  item: { name: string; subtitle: string; durationMs: number },
  styles: OutputStyles,
): string {
  const name = styles.name(sanitizeOneLineText(item.name));
  const metadata = styles.metadata(
    `${sanitizeOneLineText(item.subtitle)} · ${formatDuration(item.durationMs)}`,
  );
  return `${name} — ${metadata}`;
}

interface VolumeInput {
  relative: boolean;
  value: number;
}

function parseVolumeInput(value: string): VolumeInput {
  if (/^[+-]\d+$/.test(value)) {
    const delta = Number(value);
    if (Number.isSafeInteger(delta) && Math.abs(delta) <= 100) {
      return { relative: true, value: delta };
    }
    throw new ConfigurationError('Relative volume must be between -100 and +100.');
  }
  if (/^\d+$/.test(value)) {
    const volume = Number(value);
    if (Number.isSafeInteger(volume) && volume <= 100) {
      return { relative: false, value: volume };
    }
  }
  throw new ConfigurationError('Volume must be from 0 to 100, or a change such as +10 or -10.');
}

function parseConfigKey(value: string): ConfigKey {
  if (CONFIG_KEYS.includes(value as ConfigKey)) return value as ConfigKey;
  throw new ConfigurationError(
    `Unknown configuration key "${value}". Valid keys: ${CONFIG_KEYS.join(', ')}.`,
  );
}

function formatConfig(config: Awaited<ReturnType<ConfigStore['read']>>): string {
  return CONFIG_KEYS.map((key) => `${key}: ${String(config[key])}`).join('\n');
}


function parseCompletionShell(value: string): CompletionShell {
  if (value === 'bash' || value === 'zsh' || value === 'fish') return value;
  throw new ConfigurationError('Completion shell must be "bash", "zsh", or "fish".');
}

function parseLimit(value: string): number {
  const limit = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('Search limit must be an integer between 1 and 10.');
  }
  return limit;
}

function parseCollectionLimit(value: string): number {
  const limit = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Limit must be an integer between 1 and 50.');
  }
  return limit;
}
