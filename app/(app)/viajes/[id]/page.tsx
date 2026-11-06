import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { loadTripView } from "@/lib/trip-view";
import { TripForm } from "../trip-form";
import { DeleteExtraButton, DeleteTripButton, MileageForm, TollForm } from "./extras";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await loadTripView(await getDb(), id);
  if (!view) notFound();
  const { trip, totals } = view;
  return (
    <div className="space-y-4">
      <div>
        <Link href="/viajes" className="text-sm text-primary">
          ← Viajes
        </Link>
        <h1 className="text-xl font-semibold">{trip.name}</h1>
        <p className="text-sm text-muted-foreground">{trip.isGeneral ? "Gastos de empresa fuera de viaje (pasajes para el equipo, oficina…)" : `${trip.destination ? `${trip.destination} · ` : ""}${formatDate(trip.dateFrom)} – ${formatDate(trip.dateTo)}`}</p>
      </div>

      <Card className="space-y-2" data-testid="trip-totals">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Total del viaje</span>
          <span className="text-2xl font-semibold" data-testid="trip-total">
            {formatMoney(totals.total)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-muted p-2">
            <div className="font-semibold">{formatMoney(totals.expenses)}</div>
            <div className="text-xs text-muted-foreground">Gastos</div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="font-semibold">{formatMoney(totals.mileage)}</div>
            <div className="text-xs text-muted-foreground">Km</div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="font-semibold">{formatMoney(totals.tolls)}</div>
            <div className="text-xs text-muted-foreground">Peajes</div>
          </div>
        </div>
        {totals.byCurrency.length ? (
          <p className="text-xs text-muted-foreground">En moneda original: {totals.byCurrency.map((c) => formatMoney(c.amount, c.currency)).join(" · ")}</p>
        ) : null}
        {totals.missingFx ? <p className="text-sm text-warning">{totals.missingFx} líneas sin tipo de cambio (no suman al total en EUR).</p> : null}
        {view.byCategory.length ? (
          <ul className="text-sm">
            {view.byCategory.map((c) => (
              <li key={c.name} className="flex justify-between border-t border-border py-1">
                <span>{c.name}</span>
                <span>{formatMoney(c.eur)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <CardTitle className="mb-2">Kilómetros</CardTitle>
        <p className="mb-2 text-sm text-muted-foreground">Cálculo: (km totales − km a descontar) × {formatMoney(view.kmRate)} por km.</p>
        <ul className="mb-3 space-y-1 text-sm">
          {view.mileage.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2">
              <span>
                ({formatNumber(m.kmTotal, 0)} − {formatNumber(m.kmDeduction, 0)}) km × {formatMoney(m.rateEur)}
                {m.deductionReason ? <span className="block text-xs text-muted-foreground">{m.deductionReason}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <strong>{formatMoney(m.eur)}</strong>
                {m.rendered ? <Badge tone="info">Rendido</Badge> : <DeleteExtraButton kind="km" id={m.id} tripId={trip.id} />}
              </span>
            </li>
          ))}
        </ul>
        <MileageForm tripId={trip.id} />
      </Card>

      <Card>
        <CardTitle className="mb-2">Peajes</CardTitle>
        <ul className="mb-3 space-y-1 text-sm">
          {view.tolls.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2">
              <span>
                {formatMoney(p.amount, p.currency)}
                {p.date ? ` · ${formatDate(p.date)}` : ""}
                {p.note ? <span className="block text-xs text-muted-foreground">{p.note}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <strong>{p.eur ? formatMoney(p.eur) : "Sin tipo de cambio"}</strong>
                {p.rendered ? <Badge tone="info">Rendido</Badge> : <DeleteExtraButton kind="toll" id={p.id} tripId={trip.id} />}
              </span>
            </li>
          ))}
        </ul>
        <TollForm tripId={trip.id} />
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Gastos asignados ({view.expenses.length})</CardTitle>
          <Link href={`/revision?f=viaje&trip=${trip.id}`} className="text-sm text-primary">
            Revisar
          </Link>
        </div>
        <ul className="divide-y divide-border text-sm">
          {view.expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{e.merchant}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(e.date)} · {e.category ?? "Sin categoría"}
                </span>
              </span>
              <span className="text-right">
                <span className="block">{formatMoney(e.amount, e.currency)}</span>
                <span className="text-xs">
                  {e.applies === true ? <Badge tone="success">Empresa</Badge> : e.applies === false ? <Badge>Personal</Badge> : <Badge tone="warning">Por revisar</Badge>}
                  {e.rendered ? <Badge tone="info" className="ml-1">Rendido</Badge> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {!trip.isGeneral ? (
        <Card>
          <CardTitle className="mb-3">Editar viaje</CardTitle>
          <TripForm trip={trip} />
          <div className="mt-3">
            <DeleteTripButton id={trip.id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
