// argon2id password hashing (OWASP minimum settings are the library defaults: 19 MiB, 2 passes).
// No "server-only" here: the user scripts import it too.
import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  // Algorithm 2 is argon2id (the const enum is not available under isolatedModules).
  return hash(password, { algorithm: 2 });
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** A one-time password for `user:create` and `user:reset-password`: 16 characters, no look-alikes. */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
