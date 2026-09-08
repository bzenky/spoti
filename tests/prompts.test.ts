import { describe, expect, it } from 'vitest';

import {
  parsePageSelectionInput,
  parseSelectionInput,
} from '../src/ui/prompts.js';

describe('parseSelectionInput', () => {
  it('accepts one-based selections and returns a zero-based index', () => {
    expect(parseSelectionInput('1', 3)).toEqual({ status: 'selected', index: 0 });
    expect(parseSelectionInput(' 3 ', 3)).toEqual({ status: 'selected', index: 2 });
  });

  it('treats an empty answer as cancellation', () => {
    expect(parseSelectionInput('', 3)).toEqual({ status: 'cancelled' });
    expect(parseSelectionInput('   ', 3)).toEqual({ status: 'cancelled' });
  });

  it.each(['0', '4', '-1', '2junk', '1.5', 'word'])(
    'rejects invalid selection %j',
    (value) => {
      expect(parseSelectionInput(value, 3)).toEqual({ status: 'invalid' });
    },
  );
});

describe('parsePageSelectionInput', () => {
  const view = {
    items: ['first', 'second'],
    startIndex: 20,
    hasNext: true,
    hasPrevious: true,
  };

  it('accepts global item numbers and available navigation', () => {
    expect(parsePageSelectionInput('21', view)).toEqual({ type: 'select', index: 0 });
    expect(parsePageSelectionInput('22', view)).toEqual({ type: 'select', index: 1 });
    expect(parsePageSelectionInput('n', view)).toEqual({ type: 'next' });
    expect(parsePageSelectionInput(' P ', view)).toEqual({ type: 'previous' });
    expect(parsePageSelectionInput('', view)).toEqual({ type: 'cancel' });
  });

  it('rejects unavailable navigation and numbers outside the visible page', () => {
    expect(
      parsePageSelectionInput('p', { ...view, hasPrevious: false }),
    ).toEqual({ type: 'invalid' });
    expect(parsePageSelectionInput('n', { ...view, hasNext: false })).toEqual({
      type: 'invalid',
    });
    expect(parsePageSelectionInput('20', view)).toEqual({ type: 'invalid' });
    expect(parsePageSelectionInput('23', view)).toEqual({ type: 'invalid' });
  });
});
