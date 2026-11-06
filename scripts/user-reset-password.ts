/** pnpm user:reset-password [usuario] — cambia la contraseña y revoca todas las sesiones. */
import { eq } from "drizzle-orm";
import { audit } from "../lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/auth/password";
import { getDb } from "../lib/db/client";
import { sessions, users } from "../lib/db/schema";
import { ask } from "./_cli";

async function main() {
  const db = await getDb();
  const username = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : await ask("Usuario: ")).toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.username, username));
  if (!u) throw new Error("No existe ese usuario.");
  const password = process.env.NEW_PASSWORD ?? (await ask(`Contraseña nueva (mín. ${MIN_PASSWORD_LENGTH}): `, { hidden: true }));
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  await db.update(users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() }).where(eq(users.id, u.id));
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, u.id));
  await audit(db, "user.reset_password", "users", u.id);
  console.log("Contraseña actualizada. Se cerraron todas las sesiones.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
