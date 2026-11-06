import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { listTrips } from "@/lib/queries";
import { TripForm } from "./trip-form";

export default async function TripsPage() {
  const db = await getDb();
  const list = await listTrips(db);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Viajes</h1>
      <Card>
        <ul className="divide-y divide-border" data-testid="trip-list">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/viajes/${t.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{t.name}</span>
                  {t.destination ? <span className="block text-xs text-muted-foreground">{t.destination}</span> : null}
                </span>
                <span className="text-sm text-muted-foreground">{t.isGeneral ? "Fuera de viaje" : `${formatDate(t.dateFrom)} – ${formatDate(t.dateTo)}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardTitle className="mb-3">Nuevo viaje</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Los gastos con fecha dentro del rango se asignan solos al viaje (salvo los que cambiaste a mano).</p>
        <TripForm />
      </Card>
    </div>
  );
}
