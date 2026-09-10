import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';

import {
  DEVICE_SHORTCUTS,
  GLOBAL_SHORTCUTS,
  LIBRARY_SHORTCUTS,
  NAVIGATION_ITEMS,
  PLAYER_SHORTCUTS,
  QUEUE_SHORTCUTS,
  SEARCH_SHORTCUTS,
  type ShortcutHelp,
  type TuiScreen,
} from './navigation.js';

export function NavigationBar({
  activeScreen,
  compact = false,
}: {
  activeScreen: TuiScreen;
  compact?: boolean;
}) {
  return (
    <Box flexWrap="wrap" columnGap={2}>
      {NAVIGATION_ITEMS.map((item) => (
        <Text
          key={item.screen}
          bold={item.screen === activeScreen}
          {...(item.screen === activeScreen ? { color: 'green' as const } : { dimColor: true })}
        >
          [{item.key}]{compact ? '' : ` ${item.label}`}
        </Text>
      ))}
    </Box>
  );
}

interface HelpEntry {
  key: string;
  section?: string;
  shortcut?: ShortcutHelp;
}

export function HelpScreen({ availableRows = 10 }: { availableRows?: number }) {
  const [offset, setOffset] = useState(0);
  const entries = useMemo(
    () =>
      [
        helpSection('Navigation', NAVIGATION_ITEMS.map(toShortcutHelp)),
        helpSection('Player', PLAYER_SHORTCUTS),
        helpSection('Search', SEARCH_SHORTCUTS),
        helpSection('Queue', QUEUE_SHORTCUTS),
        helpSection('Devices', DEVICE_SHORTCUTS),
        helpSection('Library', LIBRARY_SHORTCUTS),
        helpSection('Global', GLOBAL_SHORTCUTS),
      ].flat(),
    [],
  );
  const entryRows = Math.max(1, availableRows - 2);
  const maximumOffset = Math.max(0, entries.length - entryRows);
  const visibleEntries = entries.slice(offset, offset + entryRows);

  useInput((_input, key) => {
    if (key.upArrow || key.pageUp) setOffset((current) => Math.max(0, current - 1));
    if (key.downArrow || key.pageDown) {
      setOffset((current) => Math.min(maximumOffset, current + 1));
    }
    if (key.home) setOffset(0);
    if (key.end) setOffset(maximumOffset);
  });

  return (
    <Box flexDirection="column" height="100%" overflow="hidden">
      <Text bold>Keyboard shortcuts</Text>
      {offset > 0 ? <Text dimColor>↑ {offset} more</Text> : null}
      {visibleEntries.map((entry) =>
        entry.section ? (
          <Text key={entry.key} color="green">{entry.section}</Text>
        ) : (
          <Text key={entry.key} wrap="truncate-end">
            <Text bold>{entry.shortcut?.keys.padEnd(12)}</Text>
            {entry.shortcut?.description}
          </Text>
        ),
      )}
      {offset < maximumOffset ? (
        <Text dimColor>↓ {maximumOffset - offset} more · ↑/↓ scroll · Home/End</Text>
      ) : null}
    </Box>
  );
}

function helpSection(title: string, shortcuts: readonly ShortcutHelp[]): HelpEntry[] {
  return [
    { key: `section:${title}`, section: title },
    ...shortcuts.map((shortcut) => ({
      key: `${title}:${shortcut.keys}`,
      shortcut,
    })),
  ];
}

function toShortcutHelp(item: (typeof NAVIGATION_ITEMS)[number]): ShortcutHelp {
  return { keys: item.key, description: `Open ${item.label}` };
}
