import "server-only";
import { NextResponse } from "next/server";
import { requireApiSession } from "../auth/api";
import { getDb } from "../db/client";
import { buildReport, type ReportData } from "./build";
import { getReport } from "./lifecycle";

export async function loadReportForDownload(id: string): Promise<ReportData | NextResponse> {
  const s = await requireApiSession();
  if (s instanceof NextResponse) return s;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const db = await getDb();
  const report = await getReport(db, id);
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return buildReport(db, { dateFrom: report.dateFrom, dateTo: report.dateTo, report });
}

export function fileName(r: ReportData, ext: string) {
  return `rendicion_${r.dateFrom}_${r.dateTo}.${ext}`;
}

export function download(body: BodyInit, contentType: string, name: string) {
  return new NextResponse(body, {
    headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
