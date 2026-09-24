/* global console, process, URL */
import { mkdtemp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'spoti-package-smoke-'));
const packDirectory = join(temporaryRoot, 'pack');
const installPrefix = join(temporaryRoot, 'prefix');
const npmCliPath = process.env.npm_execpath;
if (!npmCliPath) {
  throw new Error('npm_execpath is required. Run this check through npm run smoke:package.');
}

try {
  await mkdir(packDirectory);
  runNpm(['pack', '--pack-destination', packDirectory], projectRoot);

  const archives = (await readdir(packDirectory)).filter((entry) => entry.endsWith('.tgz'));
  if (archives.length !== 1) {
    throw new Error(`Expected one npm archive, found ${archives.length}.`);
  }

  const archive = join(packDirectory, archives[0]);
  runNpm(['install', '--global', '--prefix', installPrefix, archive], projectRoot);

  const npmRoot = runNpm(
    ['root', '--global', '--prefix', installPrefix],
    projectRoot,
  ).trim();
  const cliPath = join(npmRoot, '@bzenky', 'spoti', 'dist', 'cli.js');

  const version = run(process.execPath, [cliPath, '--version'], projectRoot).trim();
  if (version !== packageJson.version) {
    throw new Error(`Installed CLI reported ${version}; expected ${packageJson.version}.`);
  }

  const help = run(process.execPath, [cliPath, '--help'], projectRoot);
  if (!help.includes('Control Spotify from your terminal')) {
    throw new Error('Installed CLI help output is missing the expected description.');
  }

  const completion = run(process.execPath, [cliPath, 'completion', 'bash'], projectRoot);
  if (!completion.includes('complete -F _spoti_completion spoti')) {
    throw new Error('Installed CLI did not generate the expected Bash completion.');
  }

  const nonInteractiveTui = run(process.execPath, [cliPath, 'interactive'], projectRoot);
  if (!nonInteractiveTui.includes('Usage: spoti interactive')) {
    throw new Error('Installed CLI did not handle non-interactive TUI startup safely.');
  }

  console.log(`Packed installation smoke test passed for ${packageJson.name}@${version}.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function runNpm(args, cwd) {
  return run(process.execPath, [npmCliPath, ...args], cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result.stdout;
}
