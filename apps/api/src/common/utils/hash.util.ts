import * as argon2 from 'argon2';

// DECISION: spec E.1 pins argon2id with memoryCost 19456 KiB (19 MiB),
// timeCost 2, parallelism 1. Centralised here so register/login/refresh
// never restate the params.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    // argon2.verify encodes params in the hash string, so no options needed.
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash stored historically — treat as mismatch, never crash login.
    return false;
  }
}
