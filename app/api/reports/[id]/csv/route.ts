import { NextResponse } from "next/server";
import { reportCsv } from "@/lib/reports/csv";
import { download, fileName, loadReportForDownload } from "@/lib/reports/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadReportForDownload((await params).id);
  if (r instanceof NextResponse) return r;
  return download(reportCsv(r), "text/csv; charset=utf-8", fileName(r, "csv"));
}
