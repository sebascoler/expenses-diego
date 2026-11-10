import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { audit } from "../audit";
import type { DbOrTx } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";

export class UserError extends Error {}

export const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;

/**
 * Usuarios con acceso a los mismos datos (Diego + tester). No hay datos por usuario:
 * todos ven y editan los mismos gastos, viajes y rendiciones (ver docs/DECISIONS.md).
 */
export async function listUsers(db: DbOrTx) {
  return db
    .select({ id: users.id, username: users.username, createdAt: users.createdAt, tourCompletedAt: users.tourCompletedAt })
    .from(users)
    .orderBy(asc(users.createdAt));
}

export async function createUser(db: DbOrTx, rawUsername: string, password: string, createdBy?: string) {
  const username = rawUsername.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new UserError("El usuario tiene que tener entre 3 y 50 letras, números, punto, guion o guion bajo (sin espacios).");
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (exists) throw new UserError("Ya existe un usuario con ese nombre.");
  const [u] = await db.insert(users).values({ username, passwordHash: await hashPassword(password) }).returning({ id: users.id, username: users.username });
  await audit(db, "user.create", "users", u.id, createdBy ? { by: createdBy } : {});
  return u;
}

/** Borra otro usuario (sus sesiones se borran en cascada). Nunca a uno mismo ni al último. */
export async function deleteUser(db: DbOrTx, id: string, currentUserId: string) {
  if (id === currentUserId) throw new UserError("No podés borrar tu propio usuario.");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count <= 1) throw new UserError("Tiene que quedar al menos un usuario.");
  const res = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (!res.length) throw new UserError("El usuario no existe.");
  await audit(db, "user.delete", "users", id, { by: currentUserId });
}

export async function setTourCompleted(db: DbOrTx, userId: string, completed: boolean) {
  await db.update(users).set({ tourCompletedAt: completed ? new Date() : null }).where(eq(users.id, userId));
}

export async function needsTour(db: DbOrTx, userId: string): Promise<boolean> {
  const [u] = await db.select({ t: users.tourCompletedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(u) && u.t === null;
}
