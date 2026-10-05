import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:process', async () => {
  const { PassThrough } = await import('node:stream');
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode: vi.fn(function (mode: boolean) { stdin.isRaw = mode; }),
  });
  const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 80 });
  stdout.resume();
  return { stdin, stdout };
});

import { stdin, stdout } from 'node:process';
import {
  confirmUpdate, promptSpotifyClientId, selectAlbumAction, selectPageAction, selectTrack,
} from '../src/ui/prompts.js';

const track = {
  id: 'numb', uri: 'spotify:track:numb', name: 'Numb', artists: ['Linkin Park'],
  album: 'Meteora', durationMs: 185_000,
};
const view = {
  items: [track], pageNumber: 1, startIndex: 0, hasNext: true, hasPrevious: false,
};

describe('interactive selection prompts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    ['track', () => selectTrack([track]), null],
    ['action', () => selectAlbumAction(), null],
    ['page', () => selectPageAction(view), { type: 'cancel' }],
  ] as const)('cancels the %s picker on Escape without Enter', async (_name, select, expected) => {
    const listenerCount = stdin.listenerCount('keypress');
    const result = select();
    stdin.emit('data', Buffer.from('1'));
    stdin.emit('data', Buffer.from('\u001b'));

    await expect(result).resolves.toEqual(expected);
    expect(stdin.listenerCount('keypress')).toBe(listenerCount);
    expect(stdin.isRaw).toBe(false);
  });

  it('keeps arrow keys working and accepts a numbered selection', async () => {
    const result = selectTrack([track]);
    stdin.emit('data', Buffer.from('1\u001b[D\u001b[C\r'));
    await expect(result).resolves.toEqual(track);
    expect(stdin.isRaw).toBe(false);
  });

  it('cancels after invalid input and does not affect the next prompt', async () => {
    const write = vi.spyOn(stdout, 'write');
    const result = selectTrack([track]);
    stdin.emit('data', Buffer.from('invalid\r'));
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith(
      'Selection must be a number between 1 and 1.\n',
    ));
    stdin.emit('data', Buffer.from('\u001b'));
    await expect(result).resolves.toBeNull();

    const next = selectTrack([track]);
    stdin.emit('data', Buffer.from('1\r'));
    await expect(next).resolves.toEqual(track);
    write.mockRestore();
  });

  it('preserves Enter cancellation and page navigation', async () => {
    const cancelled = selectTrack([track]);
    stdin.emit('data', Buffer.from('\r'));
    await expect(cancelled).resolves.toBeNull();

    const nextPage = selectPageAction(view);
    stdin.emit('data', Buffer.from('n\r'));
    await expect(nextPage).resolves.toEqual({ type: 'next' });
  });

  it.each(['\u001b', '\u0003'])('cancels setup and update with %j', async (key) => {
    const setup = promptSpotifyClientId();
    stdin.emit('data', Buffer.from(`partial-client-id${key}`));
    await expect(setup).resolves.toBeNull();

    const update = confirmUpdate('1.9.0', '1.9.1');
    stdin.emit('data', Buffer.from(`y${key}`));
    await expect(update).resolves.toBe(false);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.listenerCount('keypress')).toBe(0);
  });

  it.each([
    ['track', () => selectTrack([track]), null],
    ['action', () => selectAlbumAction(), null],
    ['page', () => selectPageAction(view), { type: 'cancel' }],
  ] as const)('cancels the %s picker on Ctrl+C without hanging', async (_name, select, expected) => {
    const result = select();
    stdin.emit('data', Buffer.from('\u0003'));
    await expect(result).resolves.toEqual(expected);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.listenerCount('keypress')).toBe(0);
  });

  it('keeps Enter and yes confirmation working for updates', async () => {
    for (const answer of ['\r', 'yes\r']) {
      const update = confirmUpdate('1.9.0', '1.9.1');
      stdin.emit('data', Buffer.from(answer));
      await expect(update).resolves.toBe(true);
    }
  });

  it('settles a question when Ctrl+D closes the input', async () => {
    const result = selectTrack([track]);
    stdin.emit('data', Buffer.from('\u0004'));
    await expect(result).resolves.toBeNull();
    expect(stdin.isRaw).toBe(false);
    expect(stdin.listenerCount('keypress')).toBe(0);
  });
});
