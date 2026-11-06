import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

function keyFrom(secret: string): Buffer {
  const decoded = Buffer.from(secret, "base64");
  // Si es una clave base64 de 32 bytes se usa tal cual; si no (dev), se deriva con SHA-256.
  if (decoded.length === 32 && /^[A-Za-z0-9+/=]+$/.test(secret)) return decoded;
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. Formato: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(env.encryptionKey), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Formato de cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(env.encryptionKey), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Descifra sin romper la pantalla si la clave cambió (devuelve null). */
export function safeDecrypt(payload: string | null | undefined): string | null {
  try {
    return decrypt(payload);
  } catch {
    return null;
  }
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function dedupHmac(value: string): string {
  return hmac(env.dedupHmacKey, value);
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
