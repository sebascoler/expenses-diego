import { NextResponse } from "next/server";
import { reportXlsx } from "@/lib/reports/xlsx";
import { download, fileName, loadReportForDownload } from "@/lib/reports/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadReportForDownload((await params).id);
  if (r instanceof NextResponse) return r;
  return download(new Uint8Array(await reportXlsx(r)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName(r, "xlsx"));
}
