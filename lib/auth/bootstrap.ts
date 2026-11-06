import "server-only";
import { sql } from "drizzle-orm";
import { audit } from "../audit";
import { safeEqual } from "../crypto";
import type { DbOrTx } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";

/**
 * Bootstrap sin consola (§16.9): si `users` está vacía y las credenciales coinciden con
 * BOOTSTRAP_USERNAME/BOOTSTRAP_PASSWORD, crea el usuario. Con un usuario ya creado queda inactivo.
 */
export async function tryBootstrap(db: DbOrTx, username: string, password: string): Promise<{ id: string; username: string } | null> {
  const bu = env.bootstrapUsername?.toLowerCase();
  const bp = env.bootstrapPassword;
  // Los motivos se loguean sin valores, para poder diagnosticar un bootstrap que no entra.
  if (!bu || !bp) {
    console.warn("[auth] bootstrap inactivo: faltan BOOTSTRAP_USERNAME o BOOTSTRAP_PASSWORD en este deploy");
    return null;
  }
  if (bp.length < MIN_PASSWORD_LENGTH) {
    console.warn(`[auth] bootstrap inactivo: BOOTSTRAP_PASSWORD tiene menos de ${MIN_PASSWORD_LENGTH} caracteres`);
    return null;
  }
  const userOk = safeEqual(username, bu);
  const passOk = safeEqual(password, bp);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) {
    console.warn("[auth] bootstrap inactivo: ya existe un usuario en la base");
    return null;
  }
  if (!userOk || !passOk) {
    console.warn(`[auth] bootstrap rechazado: no coincide ${!userOk ? "el usuario" : ""}${!userOk && !passOk ? " ni " : ""}${!passOk ? "la contraseña" : ""}`);
    return null;
  }
  const [created] = await db
    .insert(users)
    .values({ username: bu, passwordHash: await hashPassword(bp) })
    .onConflictDoNothing()
    .returning({ id: users.id, username: users.username });
  if (!created) return null;
  await audit(db, "user.bootstrap", "users", created.id);
  console.info("[auth] bootstrap: usuario creado");
  return created;
}
