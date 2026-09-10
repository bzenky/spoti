import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  waitUntilExit: vi.fn().mockResolvedValue(undefined),
  render: vi.fn(),
}));

vi.mock('ink', () => ({ render: mocks.render }));

import type { TuiServices } from '../src/tui/app.js';
import { startTui } from '../src/tui/index.js';

describe('startTui', () => {
  beforeEach(() => {
    mocks.render.mockReset();
    mocks.waitUntilExit.mockReset().mockResolvedValue(undefined);
    mocks.render.mockReturnValue({ waitUntilExit: mocks.waitUntilExit });
  });

  it('uses the alternate screen and lets Ink handle Ctrl+C cleanup', async () => {
    await startTui({} as TuiServices);

    expect(mocks.render).toHaveBeenCalledWith(expect.anything(), {
      alternateScreen: true,
      exitOnCtrlC: true,
    });
    expect(mocks.waitUntilExit).toHaveBeenCalledOnce();
  });
});
