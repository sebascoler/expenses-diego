import { formatDate } from "../format";
import type { ReportData } from "./build";

export const FX_LABEL: Record<string, string> = { wise: "Wise", bbva: "BBVA", ecb: "BCE", manual: "Manual", eur: "Sin conversión", pendiente: "Pendiente" };
const SOURCE_LABEL: Record<string, string> = { wise: "Wise", bbva: "BBVA", manual: "Manual" };

export const DETAIL_HEADERS = ["Viaje", "Fecha", "Comercio", "Categoría", "Fuente", "Moneda", "Monto original", "Recargo", "Fee", "Total original", "Tipo de cambio", "Fuente TC", "EUR", "Nota"];

/** Filas de detalle (texto y números) compartidas por Excel y CSV. Los números van con punto decimal. */
export function detailRows(r: ReportData): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const t of r.trips) {
    for (const l of t.lines)
      rows.push([
        t.name,
        formatDate(l.date),
        l.merchant,
        l.category,
        SOURCE_LABEL[l.source] ?? l.source,
        l.currency,
        Number(l.amount.toFixed(2)),
        Number(l.surcharge.toFixed(2)),
        Number(l.fee.toFixed(2)),
        Number(l.totalOriginal.toFixed(2)),
        l.fxRate ? Number(Number(l.fxRate).toFixed(6)) : "",
        FX_LABEL[l.fxSource] ?? l.fxSource,
        l.eur ? Number(l.eur.toFixed(2)) : "",
        l.note ?? "",
      ]);
    for (const m of t.mileage)
      rows.push([t.name, "", `Kilómetros: ${m.kmTotal.toFixed(0)} − ${m.kmDeduction.toFixed(0)} km × € ${m.rateEur.toFixed(2)}`, "Kilómetros", "Manual", "EUR", Number(m.eur.toFixed(2)), 0, 0, Number(m.eur.toFixed(2)), 1, "Sin conversión", Number(m.eur.toFixed(2)), m.reason ?? ""]);
    for (const p of t.tolls)
      rows.push([t.name, p.date ? formatDate(p.date) : "", "Peaje", "Peajes", "Manual", p.currency, Number(p.amount.toFixed(2)), 0, 0, Number(p.amount.toFixed(2)), p.fxRate ? Number(Number(p.fxRate).toFixed(6)) : "", p.currency === "EUR" ? "Sin conversión" : "Manual/BCE", p.eur ? Number(p.eur.toFixed(2)) : "", p.note ?? ""]);
  }
  return rows;
}
