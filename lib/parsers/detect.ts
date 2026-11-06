import { createHash } from "node:crypto";
import { normalizeHeader } from "./merchant";
import { cellText, isEmptyRow } from "./table";
import type { Cell } from "./types";

export const WISE_REQUIRED = ["date", "amount", "currency", "description"];
export const WISE_ID_HEADERS = ["transferwise id", "id"];
export const BBVA_REQUIRED = ["fecha", "importe"];
export const BBVA_DESCRIPTION = ["descripcion", "concepto", "comercio"];

const KNOWN = new Set([
  ...WISE_REQUIRED,
  ...WISE_ID_HEADERS,
  "merchant",
  "total fees",
  "exchange from",
  "exchange to",
  "exchange rate",
  "card last four digits",
  ...BBVA_REQUIRED,
  ...BBVA_DESCRIPTION,
  "moneda",
  "tarjeta",
  "estado",
]);

/** Busca la fila de encabezados (RF-17): la primera con ≥3 columnas conocidas; si no, la primera con ≥3 textos. */
export function findHeaderRow(rows: Cell[][]): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;
    const score = row.filter((c) => KNOWN.has(normalizeHeader(c))).length;
    if (score >= 3) return i;
  }
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (isEmptyRow(row)) continue;
    const texts = row.filter((c) => typeof c === "string" && c.trim() && !/^[\d.,\-/\s]+$/.test(c));
    if (texts.length >= 3) return i;
  }
  return -1;
}

export function headerList(row: Cell[]): string[] {
  return row.map((c) => cellText(c));
}

export function headerSignature(headers: string[]): string {
  const norm = headers.map(normalizeHeader).filter(Boolean).join("|");
  return createHash("sha256").update(norm).digest("hex");
}

export type DetectedSource = "wise" | "bbva" | null;

/** Detección de la fuente por las columnas (RF-11). */
export function detectSource(headers: string[]): DetectedSource {
  const set = new Set(headers.map(normalizeHeader));
  if (WISE_REQUIRED.every((h) => set.has(h)) && WISE_ID_HEADERS.some((h) => set.has(h))) return "wise";
  if (BBVA_REQUIRED.every((h) => set.has(h)) && BBVA_DESCRIPTION.some((h) => set.has(h))) return "bbva";
  return null;
}

/** Índice de una columna por nombre normalizado (o -1). */
export function columnIndex(headers: string[], ...names: string[]): number {
  const norm = headers.map(normalizeHeader);
  for (const n of names) {
    const i = norm.indexOf(normalizeHeader(n));
    if (i >= 0) return i;
  }
  return -1;
}
