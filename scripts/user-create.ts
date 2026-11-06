/** pnpm user:create [usuario] — crea el único usuario (RF-01). Pide la contraseña sin mostrarla. */
import { sql } from "drizzle-orm";
import { audit } from "../lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/auth/password";
import { getDb } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { ask } from "./_cli";

async function main() {
  const db = await getDb();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) throw new Error("Ya existe un usuario. Es una app de usuario único: usá pnpm user:reset-password o pnpm db:reset.");
  const username = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : await ask("Usuario: ")).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new Error("Usuario inválido (3 a 50 letras, números, punto o guion).");
  const password = process.env.NEW_PASSWORD ?? (await ask(`Contraseña temporal (mín. ${MIN_PASSWORD_LENGTH}): `, { hidden: true }));
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  const [u] = await db.insert(users).values({ username, passwordHash: await hashPassword(password) }).returning({ id: users.id });
  await audit(db, "user.create", "users", u.id);
  console.log(`Usuario "${username}" creado.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
