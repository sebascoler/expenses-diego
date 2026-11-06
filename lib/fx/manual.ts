import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { d, Decimal } from "../calc/money";
import type { DbOrTx } from "../db/client";
import { fxRates, transactions, tripTolls } from "../db/schema";
import { recomputeEur } from "../tx/recompute";

/**
 * Carga manual de tipo de cambio (RF-61 punto 3). Diego ingresa "1 EUR = X <moneda>" y se aplica a todas
 * las líneas sin rendir de esa moneda que no tienen tipo de cambio. Se cachea como tasa manual para las próximas.
 */
export async function applyManualRate(db: DbOrTx, currency: string, unitsPerEur: string): Promise<number> {
  const units = d(unitsPerEur);
  if (units.lte(0)) throw new Error("El tipo de cambio tiene que ser mayor a cero.");
  const rate = new Decimal(1).dividedBy(units).toFixed(10);
  const pending = await db
    .select({ id: transactions.id, date: transactions.date, feeCurrency: transactions.feeCurrency, feeFxRate: transactions.feeFxRate })
    .from(transactions)
    .where(and(eq(transactions.currency, currency), eq(transactions.fxSource, "pendiente"), isNull(transactions.reportId)));
  const dates = new Set<string>();
  for (const p of pending) {
    dates.add(p.date);
    await db
      .update(transactions)
      .set({ fxRate: rate, fxSource: "manual", fxDate: p.date, ...(p.feeCurrency === currency && !p.feeFxRate ? { feeFxRate: rate } : {}), updatedAt: new Date() })
      .where(eq(transactions.id, p.id));
  }
  const tolls = await db.select().from(tripTolls).where(and(eq(tripTolls.currency, currency), isNull(tripTolls.fxRate), isNull(tripTolls.reportId)));
  for (const t of tolls) {
    await db.update(tripTolls).set({ fxRate: rate, fxSource: "manual" }).where(eq(tripTolls.id, t.id));
    if (t.date) dates.add(t.date);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const date of dates.size ? dates : new Set([today]))
    await db
      .insert(fxRates)
      .values({ date, base: currency, quote: "EUR", rate, source: "manual" })
      .onConflictDoUpdate({ target: [fxRates.date, fxRates.base, fxRates.quote], set: { rate, source: "manual" } });
  await recomputeEur(db, pending.map((p) => p.id));
  return pending.length + tolls.length;
}
