import "server-only";
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import type { DbOrTx } from "../db/client";
import { users } from "../db/schema";
import { tryBootstrap } from "./bootstrap";
import { dummyHash, verifyPassword } from "./password";
import { checkLock, hashIp, recordAttempt } from "./rate-limit";
import { createSession } from "./session";

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: string }
  | { ok: false; reason: "invalid" | "locked"; retryAt?: Date };

export async function login(db: DbOrTx, rawUsername: string, password: string, ip: string): Promise<LoginResult> {
  const username = rawUsername.trim().toLowerCase();
  const ipHash = hashIp(ip);
  const lock = await checkLock(db, username, ipHash);
  if (lock.locked) return { ok: false, reason: "locked", retryAt: lock.retryAt };

  let [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  let valid = false;
  if (user) valid = await verifyPassword(user.passwordHash, password);
  else {
    const boot = await tryBootstrap(db, username, password);
    if (boot) {
      [user] = await db.select().from(users).where(eq(users.id, boot.id)).limit(1);
      valid = true;
    } else await verifyPassword(await dummyHash(), password);
  }
  await recordAttempt(db, username, ipHash, valid);
  if (!valid || !user) return { ok: false, reason: "invalid" };
  const s = await createSession(db, user.id);
  await audit(db, "login", "users", user.id);
  return { ok: true, token: s.token, expiresAt: s.expiresAt, userId: user.id };
}
