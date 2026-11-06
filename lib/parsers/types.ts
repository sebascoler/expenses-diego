import type { Decimal } from "../calc/money";

export type Cell = string | number | boolean | Date | null;
export type ImportSource = "wise" | "bbva";

export interface ParsedRow {
  rowNumber: number;
  source: ImportSource;
  externalId: string | null;
  date: string;
  description: string;
  merchant: string;
  /** Monto en la moneda original; negativo = gasto. */
  amount: Decimal;
  currency: string;
  accountAmount: Decimal | null;
  accountCurrency: string | null;
  feeAmount: Decimal | null;
  feeCurrency: string | null;
  cardLast4: string | null;
  bankStatus: "pendiente" | "consolidado" | null;
  kind: "gasto" | "no_gasto";
}

export interface ParseError {
  rowNumber: number;
  reason: string;
}

export interface ParseResult {
  source: ImportSource;
  rows: ParsedRow[];
  errors: ParseError[];
  /** Filas ignoradas en silencio (vacías, títulos, totales). */
  skipped: number;
}

/** Mapeo de columnas (RF-16). Los valores son los encabezados tal como aparecen en el archivo. */
export interface ColumnMapping {
  source: ImportSource;
  date: string;
  description: string;
  amount?: string | null;
  debit?: string | null;
  credit?: string | null;
  currency?: string | null;
  /** Moneda fija si el archivo no tiene columna de moneda. */
  defaultCurrency?: string | null;
  card?: string | null;
  status?: string | null;
  fee?: string | null;
  externalId?: string | null;
  /** true si en el archivo los gastos figuran con signo positivo. */
  expensesPositive?: boolean;
}
