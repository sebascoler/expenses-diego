import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2) con parámetros OWASP: 19 MiB, 2 iteraciones, paralelismo 1.
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash fijo para comparar en tiempo constante cuando el usuario no existe. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("contraseña-de-relleno-para-tiempo-constante");
  return dummy;
}
