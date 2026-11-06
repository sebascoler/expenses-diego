import { z } from "zod";
import { Decimal } from "../calc/money";
import { parseAmount } from "./amount";
import { normalizeCurrency } from "./currency";
import { parseDate } from "./date";
import { columnIndex } from "./detect";
import { normalizeMerchant } from "./merchant";
import { cellText, isEmptyRow } from "./table";
import type { Cell, ColumnMapping, ParseError, ParsedRow, ParseResult } from "./types";

export const columnMappingSchema = z
  .object({
    source: z.enum(["wise", "bbva"]),
    date: z.string().min(1),
    description: z.string().min(1),
    amount: z.string().nullish(),
    debit: z.string().nullish(),
    credit: z.string().nullish(),
    currency: z.string().nullish(),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/).nullish(),
    card: z.string().nullish(),
    status: z.string().nullish(),
    fee: z.string().nullish(),
    externalId: z.string().nullish(),
    expensesPositive: z.boolean().optional(),
  })
  .refine((m) => Boolean(m.amount) || Boolean(m.debit) || Boolean(m.credit), {
    message: "Elegí la columna de monto, o las de débito y crédito.",
  })
  .refine((m) => Boolean(m.currency) || Boolean(m.defaultCurrency), {
    message: "Elegí la columna de moneda o una moneda fija.",
  });

const NON_EXPENSE_BANK = /(pago (de )?(su )?tarjeta|su pago|pago recibido|devolucion|reintegro|bonificacion|transferencia recibida)/i;

export function parseStatus(raw: unknown): "pendiente" | "consolidado" | null {
  const s = cellText(raw as Cell).toLowerCase();
  if (!s) return null;
  if (/pend|sin consolidar|no consolidad|en proceso|autoriz/.test(s)) return "pendiente";
  if (/consolid|liquid|confirm|procesad|contabiliz/.test(s)) return "consolidado";
  return null;
}

export function parseCardLast4(raw: unknown): string | null {
  const m = cellText(raw as Cell).match(/(\d{4})\s*$/);
  return m ? m[1] : null;
}

export function isFooterRow(row: Cell[]): boolean {
  return row.some((c) => /\b(total|saldo|subtotal)\b/i.test(cellText(c)));
}

/** Parser genérico a partir de un mapeo de columnas (BBVA y archivos desconocidos, RF-16). */
export function parseWithMapping(rows: Cell[][], headerIdx: number, mapping: ColumnMapping): ParseResult {
  const headers = rows[headerIdx].map((c) => cellText(c));
  const col = (name: string | null | undefined) => (name ? columnIndex(headers, name) : -1);
  const idx = {
    date: col(mapping.date),
    description: col(mapping.description),
    amount: col(mapping.amount),
    debit: col(mapping.debit),
    credit: col(mapping.credit),
    currency: col(mapping.currency),
    card: col(mapping.card),
    status: col(mapping.status),
    fee: col(mapping.fee),
    externalId: col(mapping.externalId),
  };
  const out: ParsedRow[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    if (isEmptyRow(row)) {
      skipped++;
      continue;
    }
    const date = parseDate(row[idx.date]);
    if (!date) {
      if (isFooterRow(row) || cellText(row[idx.date]) === "") {
        skipped++;
        continue;
      }
      errors.push({ rowNumber, reason: `Fecha inválida: "${cellText(row[idx.date]).slice(0, 30)}"` });
      continue;
    }
    let amount: Decimal | null;
    if (idx.amount >= 0) {
      amount = parseAmount(row[idx.amount]);
      if (amount && mapping.expensesPositive) amount = amount.negated();
    } else {
      const debit = idx.debit >= 0 ? parseAmount(row[idx.debit]) : null;
      const credit = idx.credit >= 0 ? parseAmount(row[idx.credit]) : null;
      amount = debit || credit ? (credit ?? new Decimal(0)).abs().minus((debit ?? new Decimal(0)).abs()) : null;
    }
    if (!amount) {
      errors.push({ rowNumber, reason: "Monto vacío o inválido" });
      continue;
    }
    if (amount.isZero()) {
      skipped++;
      continue;
    }
    const currency = normalizeCurrency(idx.currency >= 0 ? row[idx.currency] : null, mapping.defaultCurrency ?? null);
    if (!currency) {
      errors.push({ rowNumber, reason: "Moneda desconocida" });
      continue;
    }
    const description = cellText(row[idx.description]);
    const fee = idx.fee >= 0 ? parseAmount(row[idx.fee]) : null;
    const kind = amount.isPositive() || NON_EXPENSE_BANK.test(description) ? "no_gasto" : "gasto";
    out.push({
      rowNumber,
      source: mapping.source,
      externalId: idx.externalId >= 0 ? cellText(row[idx.externalId]) || null : null,
      date,
      description,
      merchant: normalizeMerchant(description),
      amount,
      currency,
      accountAmount: null,
      accountCurrency: null,
      feeAmount: fee && !fee.isZero() ? fee.abs() : null,
      feeCurrency: fee && !fee.isZero() ? currency : null,
      cardLast4: idx.card >= 0 ? parseCardLast4(row[idx.card]) : null,
      bankStatus: idx.status >= 0 ? parseStatus(row[idx.status]) : null,
      kind,
    });
  }
  return { source: mapping.source, rows: out, errors, skipped };
}
