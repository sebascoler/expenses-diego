import "server-only";
import { and, eq, gte, desc } from "drizzle-orm";
import { hmac } from "../crypto";
import type { DbOrTx } from "../db/client";
import { loginAttempts } from "../db/schema";
import { env } from "../env";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

export function hashIp(ip: string): string {
  return hmac(env.sessionSecret, `ip|${ip}`).slice(0, 32);
}

/**
 * RF-03: tras 5 intentos fallidos en 15 minutos (por usuario o por IP), bloqueo de 15 minutos
 * contados desde el último fallo. Un login exitoso no borra el historial, pero corta la racha.
 */
export async function checkLock(db: DbOrTx, username: string, ipHash: string, now = new Date()): Promise<{ locked: boolean; retryAt?: Date }> {
  const since = new Date(now.getTime() - WINDOW_MS - LOCK_MS);
  for (const cond of [eq(loginAttempts.username, username), eq(loginAttempts.ipHash, ipHash)]) {
    const rows = await db
      .select()
      .from(loginAttempts)
      .where(and(cond, gte(loginAttempts.createdAt, since)))
      .orderBy(desc(loginAttempts.createdAt))
      .limit(50);
    const failures: Date[] = [];
    for (const r of rows) {
      if (r.success) break;
      failures.push(r.createdAt);
    }
    // ¿Hay 5 fallos dentro de una ventana de 15 minutos?
    for (let i = 0; i + MAX_FAILURES - 1 < failures.length; i++) {
      const newest = failures[i];
      const fifth = failures[i + MAX_FAILURES - 1];
      if (newest.getTime() - fifth.getTime() <= WINDOW_MS) {
        const retryAt = new Date(failures[0].getTime() + LOCK_MS);
        if (retryAt > now) return { locked: true, retryAt };
        break;
      }
    }
  }
  return { locked: false };
}

export async function recordAttempt(db: DbOrTx, username: string, ipHash: string, success: boolean) {
  await db.insert(loginAttempts).values({ username, ipHash, success });
}
