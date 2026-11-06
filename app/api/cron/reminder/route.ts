import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { runReminder } from "@/lib/mail/reminder";

export const runtime = "nodejs";

/** Vercel Cron (diario) → exige Authorization: Bearer CRON_SECRET (RF-84). */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const res = await runReminder(await getDb());
  return NextResponse.json(res);
}
