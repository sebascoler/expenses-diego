import "server-only";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hmac, randomToken } from "../crypto";
import { getDb, type DbOrTx } from "../db/client";
import { sessions, users } from "../db/schema";
import { env } from "../env";

export const SESSION_COOKIE = "ed_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return hmac(env.sessionSecret, `session|${token}`);
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" && !env.appUrl.startsWith("http://");
}

export async function createSession(db: DbOrTx, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: tokenHash(token), expiresAt });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", expires: expiresAt });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export interface SessionUser {
  sessionId: string;
  userId: string;
  username: string;
}

/** Valida la sesión contra la base (no alcanza con que exista la cookie). Renueva la expiración si corresponde. */
export async function validateToken(db: DbOrTx, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt, username: users.username })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > RENEW_AFTER_MS) {
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) }).where(eq(sessions.id, row.id));
  }
  return { sessionId: row.id, userId: row.userId, username: row.username };
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const db = await getDb();
  return validateToken(db, jar.get(SESSION_COOKIE)?.value);
});

/** Para páginas y Server Actions: exige sesión válida o redirige a /login. */
export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function revokeSession(db: DbOrTx, sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeOtherSessions(db: DbOrTx, userId: string, keepSessionId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId), isNull(sessions.revokedAt)));
}
