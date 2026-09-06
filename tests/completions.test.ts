import { describe, expect, it } from 'vitest';

import {
  generateCompletionScript,
  type CompletionShell,
} from '../src/ui/completions.js';

const commands = [
  'setup',
  'login',
  'logout',
  'status',
  'config',
  'interactive',
  'now',
  'pause',
  'resume',
  'next',
  'previous',
  'devices',
  'device',
  'seek',
  'volume',
  'queue',
  'shuffle',
  'repeat',
  'album',
  'artist',
  'playlists',
  'playlist',
  'liked',
  'like',
  'unlike',
  'recent',
  'update',
  'search',
  'play',
  'completion',
] as const;

const aliases = [
  'i',
  'p',
  'pa',
  'r',
  'np',
  'q',
  's',
  'vol',
  'dev',
  'devs',
  'pl',
  'pls',
  'rep',
  'rec',
  'n',
  'prev',
] as const;

const configSubcommands = ['get', 'set', 'reset', 'path', 'unset'] as const;

function expectWords(script: string, words: readonly string[]): void {
  for (const word of words) {
    expect(script, `missing completion for ${word}`).toMatch(
      new RegExp(`(^|[^A-Za-z0-9-])${word}([^A-Za-z0-9-]|$)`, 'm'),
    );
  }
}

describe('generateCompletionScript', () => {
  it.each([
    [
      'bash',
      '# bash completion for spoti',
      'complete -F _spoti_completion spoti',
      ['--help', '--version', '--first', '--watch', '--no-watch', '--limit', '--check'],
    ],
    [
      'zsh',
      '#compdef spoti',
      `_spoti "$@"`,
      ['--help', '--version', '--first', '--watch', '--no-watch', '--limit', '--check'],
    ],
    [
      'fish',
      '# fish completion for spoti',
      'complete -c spoti',
      ['-l help', '-l version', '-l first', '-l watch', '-l no-watch', '-l limit', '-l check'],
    ],
  ] as const)(
    'generates a self-contained %s script',
    (shell, header, registration, options) => {
      const script = generateCompletionScript(shell);

      expect(script.startsWith(header)).toBe(true);
      expect(script).toContain(registration);
      expectWords(script, commands);
      expectWords(script, aliases);
      expectWords(script, configSubcommands);
      for (const option of options) expect(script).toContain(option);
      expect(script).not.toMatch(/\$\(\s*spoti\b/);
      expect(script).not.toMatch(/\b(?:curl|wget)\b/);
    },
  );

  it('includes configuration keys and useful argument values', () => {
    for (const shell of ['bash', 'zsh', 'fish'] satisfies CompletionShell[]) {
      const script = generateCompletionScript(shell);

      expectWords(script, ['spotifyClientId', 'watchAfterPlay', 'refreshIntervalMs']);
      expectWords(script, ['on', 'off', 'track', 'context']);
      expectWords(script, ['bash', 'zsh', 'fish']);
      expect(script).not.toContain('--json');
    }
  });

  it('rejects unsupported shells', () => {
    const generateForUnknownShell = generateCompletionScript as (shell: string) => string;

    expect(() => generateForUnknownShell('powershell')).toThrow(
      'Unsupported shell: powershell',
    );
  });
});
