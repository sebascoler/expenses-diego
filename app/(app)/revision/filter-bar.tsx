"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  revisar: "Por revisar",
  empresa: "Empresa",
  personal: "Personal",
  viaje: "Por viaje",
  fuente: "Fuente",
  pendientes: "Pendientes BBVA",
  rendidos: "Rendidos",
  no_gasto: "No son gastos",
};

export function FilterBar({ filter, trips, tripId, source }: { filter: string; trips: { id: string; name: string }[]; tripId?: string; source?: string }) {
  const router = useRouter();
  return (
    <div className="space-y-2">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {Object.entries(LABELS).map(([k, label]) => (
          <Link
            key={k}
            href={`/revision?f=${k}`}
            className={cn("flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm", filter === k ? "border-primary bg-primary text-white" : "border-border bg-card")}
          >
            {label}
          </Link>
        ))}
      </div>
      {filter === "viaje" ? (
        <Select aria-label="Elegir viaje" value={tripId ?? ""} onChange={(e) => router.push(`/revision?f=viaje&trip=${e.target.value}`)}>
          <option value="">Todos los viajes</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      ) : null}
      {filter === "fuente" ? (
        <Select aria-label="Elegir fuente" value={source ?? ""} onChange={(e) => router.push(`/revision?f=fuente&source=${e.target.value}`)}>
          <option value="">Todas las fuentes</option>
          <option value="wise">Wise</option>
          <option value="bbva">BBVA</option>
          <option value="manual">Manual</option>
        </Select>
      ) : null}
    </div>
  );
}
