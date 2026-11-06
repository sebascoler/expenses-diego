import { formatDate, formatMoney } from "../format";
import type { ReportData } from "./build";

/** Borrador de mail en español, tono profesional (RF-74). */
export function emailDraft(r: ReportData): { subject: string; body: string } {
  const period = `${formatDate(r.dateFrom)} al ${formatDate(r.dateTo)}`;
  const subject = `Rendición de gastos ${period} — ${r.reportName}`;
  const lines = r.trips.map((t) => {
    const fechas = t.dateFrom && t.dateTo ? ` (${formatDate(t.dateFrom)} – ${formatDate(t.dateTo)})` : "";
    return `• ${t.name}${fechas}: ${formatMoney(t.totals.totalEur.toFixed(2))}`;
  });
  const body = [
    "Hola,",
    "",
    `Les envío la rendición de gastos del período ${period}.`,
    "",
    `Total a reembolsar: ${formatMoney(r.totalEur.toFixed(2))}`,
    "",
    "Desglose por viaje:",
    ...lines,
    "",
    "Adjunto el resumen en PDF y el detalle en Excel, con los montos en moneda original, su equivalente en euros y la fuente del tipo de cambio de cada línea.",
    "",
    "Saludos,",
    r.reportName,
  ].join("\n");
  return { subject, body };
}

/** Línea sugerida para pegar en la factura (RF-75). */
export function invoiceLine(r: ReportData): string {
  return `Gastos reembolsables del ${formatDate(r.dateFrom)} al ${formatDate(r.dateTo)} (${r.trips.length} ${r.trips.length === 1 ? "concepto" : "conceptos"}, según rendición adjunta): ${formatMoney(r.totalEur.toFixed(2))}`;
}
