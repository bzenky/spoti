import { describe, expect, it } from 'vitest';

import { withProgress, type ProgressTerminal } from '../src/ui/progress.js';

function terminal(isTTY: boolean) {
  const writes: string[] = [];
  return {
    writes,
    value: {
      isTTY,
      write: (value: string) => writes.push(value),
    } satisfies ProgressTerminal,
  };
}

describe('withProgress', () => {
  it('stays silent outside an interactive terminal', async () => {
    const output = terminal(false);

    await expect(withProgress('Searching…', async () => 42, output.value)).resolves.toBe(42);

    expect(output.writes).toEqual([]);
  });

  it('shows and clears an interactive indicator on success and failure', async () => {
    const successful = terminal(true);
    await withProgress('Searching…', async () => undefined, successful.value);
    expect(successful.writes[0]).toContain('Searching…');
    expect(successful.writes.at(-1)).toBe('\r\u001B[2K');

    const failing = terminal(true);
    await expect(
      withProgress('Loading…', async () => {
        throw new Error('failed');
      }, failing.value),
    ).rejects.toThrow('failed');
    expect(failing.writes.at(-1)).toBe('\r\u001B[2K');
  });
});
