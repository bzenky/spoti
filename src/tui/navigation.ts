export type TuiScreen =
  | 'player'
  | 'lyrics'
  | 'search'
  | 'queue'
  | 'devices'
  | 'library'
  | 'add-to-playlist'
  | 'help';

export interface NavigationItem {
  screen: TuiScreen;
  key: string;
  label: string;
}

export interface ShortcutHelp {
  keys: string;
  description: string;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { screen: 'player', key: '1', label: 'Player' },
  { screen: 'lyrics', key: 'y', label: 'Lyrics' },
  { screen: 'search', key: '/', label: 'Search' },
  { screen: 'queue', key: 'q', label: 'Queue' },
  { screen: 'devices', key: 'd', label: 'Devices' },
  { screen: 'library', key: 'l', label: 'Library' },
  { screen: 'help', key: '?', label: 'Help' },
];

export const PLAYER_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: 'Space', description: 'Play or pause' },
  { keys: 'n / p', description: 'Next or previous track' },
  { keys: '← / →', description: 'Seek backward or forward 10 seconds' },
  { keys: '- / +', description: 'Lower or raise volume by 5%' },
  { keys: 's', description: 'Toggle shuffle' },
  { keys: 'r', description: 'Cycle repeat off, track, and context' },
  { keys: 'a', description: 'Add the current track to a playlist' },
  { keys: 'Ctrl+R', description: 'Refresh playback' },
];

export const LYRICS_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: '↑ / ↓', description: 'Scroll lyrics manually' },
  { keys: 'f', description: 'Resume following synced lyrics' },
  { keys: 'Enter / r', description: 'Retry after an LRCLIB error' },
  { keys: 'Esc', description: 'Return to Player' },
  { keys: 'Ctrl+X', description: 'Exit spoti from Lyrics' },
];

export const SEARCH_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: 'Type', description: 'Edit the query' },
  { keys: 'Enter', description: 'Search or play the selected result' },
  { keys: '↑ / ↓', description: 'Select a result' },
  { keys: 'Tab / ← / →', description: 'Change category' },
  { keys: 'Esc', description: 'Cancel and return to Player' },
  { keys: 'Ctrl+X', description: 'Exit spoti from Search' },
];

export const QUEUE_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: 'a', description: 'Search for a track to add' },
  { keys: 'r', description: 'Refresh the queue' },
  { keys: '↑ / ↓', description: 'Select an add-search result' },
  { keys: 'Enter', description: 'Search or add the selected track' },
  { keys: 'Esc', description: 'Cancel add flow or return to Player' },
];

export const DEVICE_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: '↑ / ↓', description: 'Select a Spotify Connect device' },
  { keys: 'Enter', description: 'Transfer playback or retry' },
  { keys: 'r', description: 'Refresh devices' },
  { keys: 'Esc', description: 'Return to Player' },
];

export const LIBRARY_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: 'Tab / ← / →', description: 'Switch Playlists, Liked, and Recent' },
  { keys: '↑ / ↓', description: 'Select an item' },
  { keys: 'Enter', description: 'Open a playlist or play a track' },
  { keys: 'n / p', description: 'Load next page or reuse previous page' },
  { keys: 'Esc', description: 'Go back one level' },
];

export const GLOBAL_SHORTCUTS: readonly ShortcutHelp[] = [
  { keys: 'Esc', description: 'Back, or exit from Player' },
  { keys: 'x', description: 'Exit spoti outside Search input' },
  { keys: 'Ctrl+C', description: 'Exit spoti' },
];

export function getNavigationScreen(input: string): TuiScreen | undefined {
  return NAVIGATION_ITEMS.find((item) => item.key === input)?.screen;
}
