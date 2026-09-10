const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function removeLastGrapheme(value: string): string {
  const segments = Array.from(graphemeSegmenter.segment(value));
  const last = segments.at(-1);
  return last ? value.slice(0, last.index) : '';
}

export function isUnmodifiedKey(input: string, key: { ctrl: boolean; meta: boolean }): boolean {
  return input.length > 0 && !key.ctrl && !key.meta;
}
