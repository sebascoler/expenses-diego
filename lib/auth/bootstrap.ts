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
  if (!bu || !bp || bp.length < MIN_PASSWORD_LENGTH) return null;
  if (!safeEqual(username, bu) || !safeEqual(password, bp)) return null;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) return null;
  const [created] = await db
    .insert(users)
    .values({ username: bu, passwordHash: await hashPassword(bp) })
    .onConflictDoNothing()
    .returning({ id: users.id, username: users.username });
  if (!created) return null;
  await audit(db, "user.bootstrap", "users", created.id);
  return created;
}
