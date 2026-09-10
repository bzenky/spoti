import { describe, expect, it, vi } from 'vitest';

import { watchPlayback, type WatchRuntime } from '../src/ui/watch.js';

describe('watchPlayback', () => {
  it('rejects non-interactive terminals instead of hanging', async () => {
    await expect(
      watchPlayback({
        player: { getCurrentPlayback: async () => null },
        refreshIntervalMs: 1_000,
      }),
    ).rejects.toThrow('Watch mode requires an interactive terminal.');
  });

  it('aborts active playback and restores the terminal on termination signals', async () => {
    const listeners = new Map<NodeJS.Signals, () => void>();
    const writes: string[] = [];
    const runtime: WatchRuntime = {
      input: { isTTY: true },
      output: { isTTY: true, write: (content) => writes.push(content) },
      environment: { NO_COLOR: '1' },
      once: (signal, listener) => { listeners.set(signal, listener); },
      removeListener: (signal, listener) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      },
    };
    let requestSignal: AbortSignal | undefined;
    const getCurrentPlayback = vi.fn(
      async (signal?: AbortSignal) => new Promise<null>((resolve) => {
        requestSignal = signal;
        signal?.addEventListener('abort', () => resolve(null), { once: true });
      }),
    );
    const watching = watchPlayback({
      player: { getCurrentPlayback },
      refreshIntervalMs: 1,
      runtime,
    });
    await vi.waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));

    listeners.get('SIGTERM')?.();
    await watching;

    expect(requestSignal?.aborted).toBe(true);
    expect(getCurrentPlayback).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
    expect(writes[0]).toBe('\u001B[?1049h\u001B[?25l');
    expect(writes.at(-1)).toBe('\u001B[?25h\u001B[?1049l');
  });
});
