import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(64).toString('base64url');
  return {
    verifier,
    challenge: createCodeChallenge(verifier),
  };
}

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url');
}
