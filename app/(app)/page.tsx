import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { counters, lastClosedReport, listTrips, sourceStatus } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export default async function HomePage() {
  const db = await getDb();
  const [status, c, tripList, last, s] = await Promise.all([sourceStatus(db), counters(db), listTrips(db), lastClosedReport(db), getSettings(db)]);
  const today = todayIso(s.timeZone);
  const recentTrips = tripList.filter((t) => !t.isGeneral && t.dateTo && (!last || t.dateTo > last.dateTo)).slice(0, 4);
  const noData = !status.wise && !status.bbva;
  const cta = noData || c.review === 0 && c.empresa === 0 ? { href: "/importar", label: "Importar movimientos" } : c.review > 0 ? { href: "/revision", label: `Revisar ${c.review} gastos` } : { href: "/rendiciones/nueva", label: "Armar la rendición" };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Hola 👋</h1>
        <p className="text-sm text-muted-foreground">{last ? `Última rendición: hasta el ${formatDate(last.dateTo)}.` : "Todavía no hiciste ninguna rendición."}</p>
      </div>

      <Card className="space-y-3" data-tour="home-stats">
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <Stat label="Por revisar" value={String(c.review)} tone={c.review > 0 ? "warn" : "ok"} />
          <Stat label="Empresa" value={String(c.empresa)} />
          <Stat label="Personal" value={String(c.personal)} />
          <Stat label="Total sin rendir" value={formatMoney(c.totalEmpresa.toFixed(2))} />
        </div>
        <Link href={cta.href} className={buttonVariants({ size: "lg", className: "w-full" })}>
          {cta.label}
        </Link>
      </Card>

      <Card data-tour="home-sources">
        <CardTitle className="mb-2">Último movimiento cargado</CardTitle>
        <ul className="space-y-2 text-sm">
          <SourceRow name="Wise" date={status.wise} hint={status.wise ? `Bajá el CSV desde el ${formatDate(status.wise)} hasta hoy.` : "Todavía no subiste ningún extracto."} />
          <SourceRow
            name="BBVA"
            date={status.bbva}
            hint={status.bbva ? `Bajá el Excel desde el ${formatDate(status.bbvaConsolidated ?? status.bbva)} hasta hoy.` : "Todavía no subiste ningún Excel."}
          />
        </ul>
        {c.pendingBbva > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Hay {c.pendingBbva} movimientos de BBVA pendientes (sin consolidar). Cuando cierre el resumen, volvé a bajar el Excel.
          </p>
        ) : null}
        {c.missingFx > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {c.missingFx} gastos de empresa no tienen tipo de cambio. Lo cargás al armar la rendición.
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Viajes del período</CardTitle>
          <Link href="/viajes" className="text-sm text-primary underline-offset-2 hover:underline">
            Ver todos
          </Link>
        </div>
        {recentTrips.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay viajes cargados desde la última rendición. Creá uno para que los gastos se asignen solos por fecha.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recentTrips.map((t) => (
              <li key={t.id} className="py-2">
                <Link href={`/viajes/${t.id}`} className="flex justify-between gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">
                    {formatDate(t.dateFrom)} – {formatDate(t.dateTo)}
                    {t.dateFrom && t.dateFrom <= today && t.dateTo && t.dateTo >= today ? " · en curso" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className={tone === "warn" ? "text-lg font-semibold text-warning" : "text-lg font-semibold"}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SourceRow({ name, date, hint }: { name: string; date: string | null; hint: string }) {
  return (
    <li className="flex items-start gap-2">
      {date ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
      <div>
        <div>
          <span className="font-medium">{name}:</span> {date ? formatDate(date) : "sin datos"}
        </div>
        <div className="text-muted-foreground">{hint}</div>
      </div>
    </li>
  );
}
