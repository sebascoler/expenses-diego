"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login } from "@/lib/auth/login";
import { clearSessionCookie, getSession, revokeSession, setSessionCookie } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { t } from "@/lib/i18n/es";

const schema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { error: t.login.invalid };
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  const db = await getDb();
  const res = await login(db, parsed.data.username, parsed.data.password, ip);
  if (!res.ok) {
    if (res.reason === "locked" && res.retryAt) {
      const hora = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(res.retryAt);
      return { error: `${t.login.locked} ${hora}.` };
    }
    return { error: t.login.invalid };
  }
  await setSessionCookie(res.token, res.expiresAt);
  redirect("/");
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await revokeSession(await getDb(), s.sessionId);
  await clearSessionCookie();
  redirect("/login");
}
