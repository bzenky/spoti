import { stripVTControlCharacters } from 'node:util';

/** Normalize external or user-provided text before placing it on one terminal line. */
export function sanitizeOneLineText(value: string): string {
  const withoutControls = Array.from(stripVTControlCharacters(value), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ? ' ' : character;
  }).join('');
  return withoutControls.replace(/\s+/g, ' ').trim();
}
