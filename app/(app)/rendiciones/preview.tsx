import { AlertTriangle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { ReportData } from "@/lib/reports/build";
import { FX_LABEL } from "@/lib/reports/rows";
import { ManualFxForm } from "./manual-fx";

export function ReportPreview({ data }: { data: ReportData }) {
  const w = data.warnings;
  return (
    <div className="space-y-3">
      {w.pendingReview || w.pendingBbva || w.missingFxTotal ? (
        <Card className="space-y-2 border-amber-300 bg-amber-50 text-sm text-amber-900" data-testid="report-warnings">
          {w.pendingReview ? (
            <p className="flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Quedan {w.pendingReview} gastos por revisar en el período (no se incluyen hasta que los marques).
            </p>
          ) : null}
          {w.pendingBbva ? (
            <p className="flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {w.pendingBbva} gastos de BBVA todavía están pendientes (sin consolidar): el monto final puede cambiar.
            </p>
          ) : null}
          {w.missingFx.map((m) => (
            <div key={m.currency} className="space-y-1">
              <p className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {m.count} líneas en {m.currency} no tienen tipo de cambio. Cargalo para poder cerrar.
              </p>
              {data.status !== "cerrado" ? <ManualFxForm currency={m.currency} reportId={data.reportId} /> : null}
            </div>
          ))}
        </Card>
      ) : null}

      <Card>
        <CardTitle className="mb-2">Por viaje</CardTitle>
        {data.trips.length === 0 ? <p className="text-sm text-muted-foreground">No hay gastos de empresa en el período.</p> : null}
        <ul className="divide-y divide-border text-sm" data-testid="report-trips">
          {data.trips.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex justify-between gap-2 font-medium">
                <span>{t.name}</span>
                <span>{formatMoney(t.totals.totalEur.toFixed(2))}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t.lines.length} gastos {formatMoney(t.totals.expensesEur.toFixed(2))}
                {t.totals.mileageEur.gt(0) ? ` · km ${formatMoney(t.totals.mileageEur.toFixed(2))}` : ""}
                {t.totals.tollsEur.gt(0) ? ` · peajes ${formatMoney(t.totals.tollsEur.toFixed(2))}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {data.byCategory.length ? (
        <Card>
          <CardTitle className="mb-2">Por categoría</CardTitle>
          <ul className="text-sm">
            {data.byCategory.map((c) => (
              <li key={c.name} className="flex justify-between border-b border-border py-1 last:border-0">
                <span>{c.name}</span>
                <span>{formatMoney(c.eur.toFixed(2))}</span>
              </li>
            ))}
          </ul>
          {data.byCurrency.length ? <p className="mt-2 text-xs text-muted-foreground">En moneda original: {data.byCurrency.map((c) => formatMoney(c.amount.toFixed(2), c.currency)).join(" · ")}</p> : null}
        </Card>
      ) : null}

      {data.trips.length ? (
        <Card>
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">Detalle línea por línea ({data.lineCount})</summary>
            {data.trips.map((t) => (
              <div key={t.id} className="mt-3">
                <h3 className="text-sm font-semibold">{t.name}</h3>
                <ul className="divide-y divide-border text-sm">
                  {t.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2 py-1">
                      <span className="min-w-0">
                        <span className="block break-words">{l.merchant}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(l.date)} · {l.category} · TC {FX_LABEL[l.fxSource]}
                          {l.surcharge.gt(0) ? ` · recargo ${formatMoney(l.surcharge.toFixed(2), l.currency)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block">{formatMoney(l.amount.toFixed(2), l.currency)}</span>
                        <span className="text-xs">{l.eur ? formatMoney(l.eur.toFixed(2)) : "Sin TC"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </Card>
      ) : null}
    </div>
  );
}
