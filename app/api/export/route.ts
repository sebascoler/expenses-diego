import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api";
import { audit } from "@/lib/audit";
import { exportAllData } from "@/lib/data-admin";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  const s = await requireApiSession();
  if (s instanceof NextResponse) return s;
  const db = await getDb();
  const data = await exportAllData(db);
  await audit(db, "data.export");
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gastos-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
