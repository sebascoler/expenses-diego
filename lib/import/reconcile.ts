import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { d } from "../calc/money";
import type { DbOrTx } from "../db/client";
import { transactions, type Transaction } from "../db/schema";
import { addDays } from "../format";
import type { ParsedRow } from "../parsers/types";

export type ReconcileMatch = { type: "none" } | { type: "single"; tx: Transaction } | { type: "ambiguous"; candidates: Transaction[] };

/**
 * Pendiente → consolidado (RF-28): mismo comercio normalizado, misma moneda, fecha ±3 días y monto ±5%.
 * Incluye pendientes ya rendidos (para no duplicarlos, RF-29); el llamador decide qué hacer con ellos.
 */
export async function findPendingMatch(db: DbOrTx, row: ParsedRow, excludeIds: Set<string>): Promise<ReconcileMatch> {
  if (row.source !== "bbva" || row.bankStatus === "pendiente" || row.kind !== "gasto") return { type: "none" };
  const candidates = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.source, "bbva"),
        eq(transactions.bankStatus, "pendiente"),
        eq(transactions.merchantNormalized, row.merchant),
        eq(transactions.currency, row.currency),
        gte(transactions.date, addDays(row.date, -3)),
        lte(transactions.date, addDays(row.date, 3)),
      ),
    );
  const amount = row.amount.abs();
  const matches = candidates.filter((c) => {
    if (excludeIds.has(c.id)) return false;
    const ca = d(c.amount).abs();
    if (ca.isZero()) return false;
    return amount.minus(ca).abs().dividedBy(ca).lte(0.05);
  });
  if (matches.length === 0) return { type: "none" };
  if (matches.length === 1) return { type: "single", tx: matches[0] };
  return { type: "ambiguous", candidates: matches };
}
