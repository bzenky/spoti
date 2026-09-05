/* global console, process, URL */
import { readFile } from 'node:fs/promises';

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: node scripts/verify-release-tag.mjs <tag>');
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  console.error(`Release tag ${tag} does not match package version ${packageJson.version}. Expected ${expectedTag}.`);
  process.exit(1);
}

console.log(`Release tag ${tag} matches package version ${packageJson.version}.`);
