import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { ConfigurationError, toError } from '../utils/errors.js';

const credentialsSchema = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().nonnegative(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export interface CredentialStore {
  read(): Promise<Credentials | null>;
  write(credentials: Credentials): Promise<void>;
  delete(): Promise<void>;
}

export interface FileCredentialStoreOptions {
  directory?: string;
}

export function getConfigDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
): string {
  const xdgConfigHome = environment.XDG_CONFIG_HOME?.trim();
  return join(xdgConfigHome || join(homeDirectory, '.config'), 'spoti');
}

export function isTokenExpired(
  credentials: Pick<Credentials, 'expiresAt'>,
  now = Date.now(),
  bufferMs = 60_000,
): boolean {
  return credentials.expiresAt <= now + bufferMs;
}

export class FileCredentialStore implements CredentialStore {
  readonly path: string;
  private readonly directory: string;

  constructor(options: FileCredentialStoreOptions = {}) {
    this.directory = options.directory ?? getConfigDirectory();
    this.path = join(this.directory, 'credentials.json');
  }

  async read(): Promise<Credentials | null> {
    return this.readFromPath(this.path);
  }

  async write(credentials: Credentials): Promise<void> {
    const validated = credentialsSchema.safeParse(credentials);
    if (!validated.success) {
      throw new ConfigurationError('Cannot store invalid Spotify credentials.');
    }

    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(this.directory, `.credentials-${randomUUID()}.tmp`);

    try {
      await writeFile(temporaryPath, `${JSON.stringify(validated.data, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, this.path);
      await chmod(this.path, 0o600);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new ConfigurationError(
        `Unable to store Spotify credentials: ${toError(error).message}`,
      );
    }
  }

  async delete(): Promise<void> {
    await this.deletePath(this.path);
  }

  private async readFromPath(path: string): Promise<Credentials | null> {
    let contents: string;
    try {
      contents = await readFile(path, 'utf8');
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw new ConfigurationError(
        `Unable to read stored Spotify credentials: ${toError(error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents) as unknown;
    } catch {
      throw new ConfigurationError('Stored Spotify credentials are not valid JSON.');
    }

    const credentials = credentialsSchema.safeParse(parsed);
    if (!credentials.success) {
      throw new ConfigurationError('Stored Spotify credentials have an invalid format.');
    }
    return credentials.data;
  }

  private async deletePath(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw new ConfigurationError(
          `Unable to delete stored Spotify credentials: ${toError(error).message}`,
        );
      }
    }
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
