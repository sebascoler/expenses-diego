import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatDate, formatMoney } from "@/lib/format";
import { buildReport, defaultRange } from "@/lib/reports/build";
import { ReportPreview } from "../preview";
import { NewReportForm } from "./form";

export default async function NewReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = await getDb();
  const def = await defaultRange(db);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const dateFrom = sp.desde && iso.test(sp.desde) ? sp.desde : def.dateFrom;
  const dateTo = sp.hasta && iso.test(sp.hasta) ? sp.hasta : def.dateTo;
  const data = await buildReport(db, { dateFrom, dateTo });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nueva rendición</h1>
      <Card className="space-y-3">
        <NewReportForm dateFrom={dateFrom} dateTo={dateTo} />
        <div className="flex items-baseline justify-between rounded-lg bg-muted p-3">
          <span className="text-sm">
            Vista previa {formatDate(dateFrom)} – {formatDate(dateTo)}
          </span>
          <span className="text-xl font-semibold" data-testid="preview-total">
            {formatMoney(data.totalEur.toFixed(2))}
          </span>
        </div>
      </Card>
      <ReportPreview data={data} />
    </div>
  );
}
