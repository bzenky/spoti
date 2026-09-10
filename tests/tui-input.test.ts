import { describe, expect, it } from 'vitest';

import { isUnmodifiedKey, removeLastGrapheme } from '../src/tui/input.js';

describe('removeLastGrapheme', () => {
  it.each([
    ['cafe\u0301', 'caf'],
    ['hello👍🏽', 'hello'],
    ['family👨‍👩‍👧‍👦', 'family'],
    ['flag🇧🇷', 'flag'],
    ['', ''],
  ])('removes one complete grapheme from %s', (value, expected) => {
    expect(removeLastGrapheme(value)).toBe(expected);
  });
});

describe('isUnmodifiedKey', () => {
  it('accepts ordinary input and rejects empty, Ctrl, and Meta input', () => {
    expect(isUnmodifiedKey('a', { ctrl: false, meta: false })).toBe(true);
    expect(isUnmodifiedKey('', { ctrl: false, meta: false })).toBe(false);
    expect(isUnmodifiedKey('a', { ctrl: true, meta: false })).toBe(false);
    expect(isUnmodifiedKey('a', { ctrl: false, meta: true })).toBe(false);
  });
});
