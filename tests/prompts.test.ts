import { describe, expect, it } from 'vitest';

import { parseSelectionInput } from '../src/ui/prompts.js';

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
