import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import type { Track } from '../services/models.js';
import { formatTrack } from './output.js';

export async function selectTrack(tracks: Track[]): Promise<Track | null> {
  if (tracks.length === 0) return null;
  if (!stdin.isTTY || !stdout.isTTY) return tracks[0] ?? null;

  stdout.write(`${tracks.map((track, index) => formatTrack(track, index)).join('\n')}\n\n`);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`Select [1-${tracks.length}] (Enter to cancel): `);
    if (!answer.trim()) return null;
    const index = Number.parseInt(answer, 10) - 1;
    return tracks[index] ?? null;
  } finally {
    prompt.close();
  }
}
