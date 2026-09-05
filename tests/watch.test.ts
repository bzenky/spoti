import { describe, expect, it } from 'vitest';

import { watchPlayback } from '../src/ui/watch.js';

describe('watchPlayback', () => {
  it('rejects non-interactive terminals instead of hanging', async () => {
    await expect(
      watchPlayback({
        player: { getCurrentPlayback: async () => null },
        refreshIntervalMs: 1_000,
      }),
    ).rejects.toThrow('Watch mode requires an interactive terminal.');
  });
});
