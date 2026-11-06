import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { buildReport } from "@/lib/reports/build";
import { invoiceLine } from "@/lib/reports/email-draft";
import { getReport } from "@/lib/reports/lifecycle";
import { getSettings } from "@/lib/settings";
import { ReportPreview } from "../preview";
import { Deliverables, ReportActions } from "./deliverables";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const report = await getReport(db, id);
  if (!report) notFound();
  const [data, s] = await Promise.all([buildReport(db, { dateFrom: report.dateFrom, dateTo: report.dateTo, report }), getSettings(db)]);
  const closed = report.status === "cerrado";
  return (
    <div className="space-y-4">
      <div>
        <Link href="/rendiciones" className="text-sm text-primary">
          ← Rendiciones
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            Rendición {formatDate(report.dateFrom)} – {formatDate(report.dateTo)}
          </h1>
          <Badge tone={closed ? "success" : "warning"} data-testid="report-status">
            {closed ? "Cerrada" : "Borrador"}
          </Badge>
        </div>
        {closed && report.closedAt ? <p className="text-sm text-muted-foreground">Cerrada el {formatDate(report.closedAt.toISOString().slice(0, 10))}. Los gastos incluidos quedaron bloqueados.</p> : null}
      </div>

      <Deliverables
        reportId={report.id}
        total={data.totalEur.toFixed(2)}
        invoiceLine={invoiceLine(data)}
        subject={report.emailSubject ?? ""}
        body={report.emailBody ?? ""}
        recipient={s.reportRecipientEmail}
        closed={closed}
        hasLines={data.trips.length > 0}
      />

      <ReportPreview data={data} />

      <Card>
        <ReportActions reportId={report.id} closed={closed} canClose={data.warnings.missingFxTotal === 0 && data.trips.length > 0} pendingReview={data.warnings.pendingReview} />
      </Card>
    </div>
  );
}
