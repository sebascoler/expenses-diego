import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./session";

/** Para route handlers: devuelve la sesión o una respuesta 401. */
export async function requireApiSession(): Promise<SessionUser | NextResponse> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return s;
}
