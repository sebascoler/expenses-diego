import "server-only";
import { asc, eq } from "drizzle-orm";
import { mileageEur, round2, tollEur, ZERO, type Decimal } from "./calc/money";
import { tripTotal, txBreakdown } from "./calc/totals";
import type { DbOrTx } from "./db/client";
import { categories, transactions, tripMileage, tripTolls, trips } from "./db/schema";
import { getSettings } from "./settings";

export async function loadTripView(db: DbOrTx, id: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, id));
  if (!trip) return null;
  const s = await getSettings(db);
  const txs = await db.select().from(transactions).where(eq(transactions.tripId, id)).orderBy(asc(transactions.date));
  const km = await db.select().from(tripMileage).where(eq(tripMileage.tripId, id)).orderBy(asc(tripMileage.createdAt));
  const tolls = await db.select().from(tripTolls).where(eq(tripTolls.tripId, id)).orderBy(asc(tripTolls.createdAt));
  const cats = new Map((await db.select().from(categories)).map((c) => [c.id, c.name]));
  const opts = { addWiseFee: s.addWiseFee };
  const gastos = txs.filter((t) => t.kind === "gasto");
  const totals = tripTotal(gastos, km, tolls, opts);
  const byCat = new Map<string, Decimal>();
  for (const t of gastos) {
    if (t.applies !== true) continue;
    const e = txBreakdown(t, opts).eur;
    if (!e) continue;
    const name = (t.categoryId && cats.get(t.categoryId)) || "Otros";
    byCat.set(name, (byCat.get(name) ?? ZERO).plus(e));
  }
  return {
    trip,
    kmRate: s.kmRateEur,
    expenses: gastos.map((t) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchantNormalized,
      amount: t.amount.replace(/^-/, ""),
      currency: t.currency,
      eur: txBreakdown(t, opts).eur?.toFixed(2) ?? null,
      applies: t.applies,
      category: (t.categoryId && cats.get(t.categoryId)) || null,
      rendered: Boolean(t.reportId),
    })),
    mileage: km.map((m) => ({ ...m, eur: mileageEur(m.kmTotal, m.kmDeduction, m.rateEur).toFixed(2), rendered: Boolean(m.reportId) })),
    tolls: tolls.map((p) => ({ ...p, eur: tollEur(p.amount, p.fxRate)?.toFixed(2) ?? null, rendered: Boolean(p.reportId) })),
    totals: {
      expenses: totals.expensesEur.toFixed(2),
      mileage: totals.mileageEur.toFixed(2),
      tolls: totals.tollsEur.toFixed(2),
      total: totals.totalEur.toFixed(2),
      missingFx: totals.missingFx,
      byCurrency: [...totals.byCurrency.entries()].map(([c, a]) => ({ currency: c, amount: round2(a).toFixed(2) })),
    },
    byCategory: [...byCat.entries()].map(([name, eur]) => ({ name, eur: round2(eur).toFixed(2) })).sort((a, b) => Number(b.eur) - Number(a.eur)),
  };
}
