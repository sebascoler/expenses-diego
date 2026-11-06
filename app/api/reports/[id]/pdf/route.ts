import { NextResponse } from "next/server";
import { reportPdf } from "@/lib/reports/pdf";
import { download, fileName, loadReportForDownload } from "@/lib/reports/route-helpers";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await loadReportForDownload((await params).id);
  if (r instanceof NextResponse) return r;
  return download(new Uint8Array(await reportPdf(r)), "application/pdf", fileName(r, "pdf"));
}
