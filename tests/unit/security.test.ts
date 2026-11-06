import { describe, expect, it, beforeEach } from "vitest";
import { decrypt, encrypt, dedupHmac, hmac } from "@/lib/crypto";
import { checkLock, recordAttempt, hashIp } from "@/lib/auth/rate-limit";
import { login } from "@/lib/auth/login";
import { validateToken, createSession, revokeOtherSessions } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { users, loginAttempts } from "@/lib/db/schema";
import { sanitizeCell } from "@/lib/reports/sanitize";
import type { DB } from "@/lib/db/client";
import { freshDb } from "../helpers/db";

describe("cifrado AES-GCM y HMAC", () => {
  it("cifra y descifra; el texto no queda en claro", () => {
    const c = encrypt("Pago a Hotel Ficticio, ref 12345")!;
    expect(c).not.toContain("Hotel");
    expect(c.startsWith("v1.")).toBe(true);
    expect(decrypt(c)).toBe("Pago a Hotel Ficticio, ref 12345");
    expect(encrypt("x")).not.toBe(encrypt("x")); // IV aleatorio
  });
  it("detecta manipulación", () => {
    const c = encrypt("hola")!;
    const parts = c.split(".");
    parts[3] = Buffer.from("chau").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("HMAC estable", () => {
    expect(dedupHmac("a|b")).toBe(dedupHmac("a|b"));
    expect(dedupHmac("a|b")).not.toBe(dedupHmac("a|c"));
    expect(hmac("k", "v")).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac("k", "v")).toBe(hmac("k", "v"));
  });
});

describe("sanitización contra formula injection (RF-73)", () => {
  it.each(["=SUM(1)", "+1", "-1", "@cmd", "\t=1"])("%s sale como texto", (v) => {
    expect(sanitizeCell(v).startsWith("'")).toBe(true);
  });
  it("deja intacto el resto", () => expect(sanitizeCell("Hotel")).toBe("Hotel"));
});

describe("login, sesiones y rate limit (RF-02, RF-03)", () => {
  let db: DB;
  beforeEach(async () => {
    db = await freshDb();
    await db.insert(users).values({ username: "diego", passwordHash: await hashPassword("una-clave-larga-1") });
  });

  it("bloquea tras 5 intentos fallidos en 15 minutos", async () => {
    for (let i = 0; i < 5; i++) expect((await login(db, "diego", "mal", "1.1.1.1")).ok).toBe(false);
    const r = await login(db, "diego", "una-clave-larga-1", "1.1.1.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("locked");
    expect((await db.select().from(loginAttempts)).length).toBe(5);
  });

  it("el bloqueo vence a los 15 minutos", async () => {
    const ip = hashIp("2.2.2.2");
    for (let i = 0; i < 5; i++) await recordAttempt(db, "diego", ip, false);
    expect((await checkLock(db, "diego", ip)).locked).toBe(true);
    expect((await checkLock(db, "diego", ip, new Date(Date.now() + 16 * 60 * 1000))).locked).toBe(false);
  });

  it("4 fallos no bloquean y el login correcto crea una sesión válida", async () => {
    for (let i = 0; i < 4; i++) await login(db, "diego", "mal", "3.3.3.3");
    const r = await login(db, "Diego", "una-clave-larga-1", "3.3.3.3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await validateToken(db, r.token))?.username).toBe("diego");
    expect(await validateToken(db, "token-falso")).toBeNull();
  });

  it("cambiar la contraseña invalida las demás sesiones (RF-04)", async () => {
    const [u] = await db.select().from(users);
    const a = await createSession(db, u.id);
    const b = await createSession(db, u.id);
    const sa = (await validateToken(db, a.token))!;
    await revokeOtherSessions(db, u.id, sa.sessionId);
    expect(await validateToken(db, a.token)).not.toBeNull();
    expect(await validateToken(db, b.token)).toBeNull();
  });
});
