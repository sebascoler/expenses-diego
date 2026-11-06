import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { d, Decimal, mileageEur, round2, sum, tollEur, ZERO } from "../calc/money";
import { tripTotal, txBreakdown, type TripTotal } from "../calc/totals";
import { safeDecrypt } from "../crypto";
import type { DbOrTx } from "../db/client";
import { categories, reports, transactions, tripMileage, tripTolls, trips, type Report } from "../db/schema";
import { addDays, todayIso } from "../format";
import { getSettings } from "../settings";

export interface ReportLine {
  id: string;
  date: string;
  merchant: string;
  description: string | null;
  category: string;
  source: string;
  currency: string;
  amount: Decimal;
  surcharge: Decimal;
  fee: Decimal;
  totalOriginal: Decimal;
  fxRate: string | null;
  fxSource: string;
  eur: Decimal | null;
  note: string | null;
  bankStatus: string | null;
}

export interface ReportMileage {
  id: string;
  kmTotal: Decimal;
  kmDeduction: Decimal;
  reason: string | null;
  rateEur: Decimal;
  eur: Decimal;
}

export interface ReportToll {
  id: string;
  amount: Decimal;
  currency: string;
  date: string | null;
  note: string | null;
  fxRate: string | null;
  eur: Decimal | null;
}

export interface ReportTrip {
  id: string;
  name: string;
  destination: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  isGeneral: boolean;
  lines: ReportLine[];
  mileage: ReportMileage[];
  tolls: ReportToll[];
  totals: TripTotal;
  byCategory: { name: string; eur: Decimal }[];
}

export interface ReportData {
  reportId: string | null;
  status: "preview" | "borrador" | "cerrado";
  dateFrom: string;
  dateTo: string;
  reportName: string;
  generatedOn: string;
  trips: ReportTrip[];
  totalEur: Decimal;
  byCategory: { name: string; eur: Decimal }[];
  byCurrency: { currency: string; amount: Decimal }[];
  lineCount: number;
  warnings: {
    pendingReview: number;
    pendingBbva: number;
    missingFx: { currency: string; count: number }[];
    missingFxTotal: number;
  };
}

/**
 * Arma la rendición a partir de los datos (RF-71, RF-77). Nunca se guardan archivos:
 * PDF, Excel, CSV y mail se regeneran siempre desde acá, así los entregables cuadran con la preview.
 */
export async function buildReport(db: DbOrTx, opts: { dateFrom: string; dateTo: string; report?: Report | null }): Promise<ReportData> {
  const s = await getSettings(db);
  const { dateFrom, dateTo, report } = opts;
  const closed = report?.status === "cerrado";
  const calcOpts = { addWiseFee: s.addWiseFee };

  const txRows = await db
    .select()
    .from(transactions)
    .where(
      closed
        ? eq(transactions.reportId, report!.id)
        : and(isNull(transactions.reportId), eq(transactions.kind, "gasto"), eq(transactions.applies, true), gte(transactions.date, dateFrom), lte(transactions.date, dateTo)),
    )
    .orderBy(asc(transactions.date));

  const tripRows = await db.select().from(trips).orderBy(asc(trips.dateFrom));
  const catRows = await db.select().from(categories);
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const general = tripRows.find((t) => t.isGeneral);

  const overlapsRange = (t: (typeof tripRows)[number]) => t.isGeneral || (t.dateFrom && t.dateTo && t.dateFrom <= dateTo && t.dateTo >= dateFrom);
  const mileageRows = await db
    .select()
    .from(tripMileage)
    .where(closed ? eq(tripMileage.reportId, report!.id) : isNull(tripMileage.reportId));
  const tollRows = await db
    .select()
    .from(tripTolls)
    .where(closed ? eq(tripTolls.reportId, report!.id) : isNull(tripTolls.reportId));
  const tripById = new Map(tripRows.map((t) => [t.id, t]));
  const includeExtra = (tripId: string, date?: string | null) => {
    if (closed) return true;
    const t = tripById.get(tripId);
    if (!t || !overlapsRange(t)) return false;
    if (t.isGeneral && date) return date >= dateFrom && date <= dateTo;
    return true;
  };

  const byTrip = new Map<string, ReportTrip>();
  const ensureTrip = (tripId: string | null) => {
    const t = (tripId && tripById.get(tripId)) || general;
    const key = t?.id ?? "sin-viaje";
    if (!byTrip.has(key))
      byTrip.set(key, {
        id: key,
        name: t?.name ?? "Gastos generales / oficina",
        destination: t?.destination ?? null,
        dateFrom: t?.dateFrom ?? null,
        dateTo: t?.dateTo ?? null,
        isGeneral: t?.isGeneral ?? true,
        lines: [],
        mileage: [],
        tolls: [],
        totals: null as unknown as TripTotal,
        byCategory: [],
      });
    return byTrip.get(key)!;
  };

  const rawLinesByTrip = new Map<string, typeof txRows>();
  for (const tx of txRows) {
    const rt = ensureTrip(tx.tripId);
    const b = txBreakdown(tx, calcOpts);
    rt.lines.push({
      id: tx.id,
      date: tx.date,
      merchant: tx.merchantNormalized,
      description: safeDecrypt(tx.descriptionEnc),
      category: (tx.categoryId && catName.get(tx.categoryId)) || "Otros",
      source: tx.source,
      currency: tx.currency,
      amount: b.base,
      surcharge: b.surcharge,
      fee: b.fee,
      totalOriginal: b.totalOriginal,
      fxRate: tx.fxRate,
      fxSource: tx.fxSource,
      eur: b.eur,
      note: safeDecrypt(tx.noteEnc),
      bankStatus: tx.bankStatus,
    });
    const list = rawLinesByTrip.get(rt.id) ?? [];
    list.push(tx);
    rawLinesByTrip.set(rt.id, list);
  }
  const mileageByTrip = new Map<string, typeof mileageRows>();
  for (const m of mileageRows) {
    if (!includeExtra(m.tripId)) continue;
    const rt = ensureTrip(m.tripId);
    rt.mileage.push({ id: m.id, kmTotal: d(m.kmTotal), kmDeduction: d(m.kmDeduction), reason: m.deductionReason, rateEur: d(m.rateEur), eur: mileageEur(m.kmTotal, m.kmDeduction, m.rateEur) });
    mileageByTrip.set(rt.id, [...(mileageByTrip.get(rt.id) ?? []), m]);
  }
  const tollsByTrip = new Map<string, typeof tollRows>();
  for (const t of tollRows) {
    if (!includeExtra(t.tripId, t.date)) continue;
    const rt = ensureTrip(t.tripId);
    rt.tolls.push({ id: t.id, amount: d(t.amount), currency: t.currency, date: t.date, note: t.note, fxRate: t.fxRate, eur: tollEur(t.amount, t.fxRate) });
    tollsByTrip.set(rt.id, [...(tollsByTrip.get(rt.id) ?? []), t]);
  }

  const catTotals = new Map<string, Decimal>();
  const currencyTotals = new Map<string, Decimal>();
  const missingByCurrency = new Map<string, number>();
  for (const rt of byTrip.values()) {
    rt.totals = tripTotal(rawLinesByTrip.get(rt.id) ?? [], mileageByTrip.get(rt.id) ?? [], tollsByTrip.get(rt.id) ?? [], calcOpts);
    const tc = new Map<string, Decimal>();
    for (const l of rt.lines) {
      if (l.eur) tc.set(l.category, (tc.get(l.category) ?? ZERO).plus(l.eur));
      else missingByCurrency.set(l.currency, (missingByCurrency.get(l.currency) ?? 0) + 1);
    }
    if (rt.totals.mileageEur.gt(0)) tc.set("Kilómetros", (tc.get("Kilómetros") ?? ZERO).plus(rt.totals.mileageEur));
    if (rt.totals.tollsEur.gt(0)) tc.set("Peajes", (tc.get("Peajes") ?? ZERO).plus(rt.totals.tollsEur));
    for (const t of rt.tolls) if (!t.eur) missingByCurrency.set(t.currency, (missingByCurrency.get(t.currency) ?? 0) + 1);
    rt.byCategory = [...tc.entries()].map(([name, eur]) => ({ name, eur: round2(eur) })).sort((a, b) => b.eur.comparedTo(a.eur));
    for (const c of rt.byCategory) catTotals.set(c.name, (catTotals.get(c.name) ?? ZERO).plus(c.eur));
    for (const [cur, amt] of rt.totals.byCurrency) currencyTotals.set(cur, (currencyTotals.get(cur) ?? ZERO).plus(amt));
  }

  const tripsOut = [...byTrip.values()]
    .filter((t) => t.lines.length || t.mileage.length || t.tolls.length)
    .sort((a, b) => (a.isGeneral === b.isGeneral ? (a.dateFrom ?? "").localeCompare(b.dateFrom ?? "") : a.isGeneral ? 1 : -1));

  let pendingReview = 0;
  let pendingBbva = 0;
  if (!closed) {
    const [w] = await db
      .select({
        review: sql<number>`count(*) filter (where ${transactions.applies} is null)::int`,
        bbva: sql<number>`count(*) filter (where ${transactions.applies} = true and ${transactions.bankStatus} = 'pendiente')::int`,
      })
      .from(transactions)
      .where(and(isNull(transactions.reportId), eq(transactions.kind, "gasto"), gte(transactions.date, dateFrom), lte(transactions.date, dateTo)));
    pendingReview = w?.review ?? 0;
    pendingBbva = w?.bbva ?? 0;
  }
  const missingFx = [...missingByCurrency.entries()].map(([currency, count]) => ({ currency, count }));

  return {
    reportId: report?.id ?? null,
    status: report ? report.status : "preview",
    dateFrom,
    dateTo,
    reportName: s.reportName,
    generatedOn: todayIso(s.timeZone),
    trips: tripsOut,
    totalEur: round2(sum(tripsOut.map((t) => t.totals.totalEur))),
    byCategory: [...catTotals.entries()].map(([name, eur]) => ({ name, eur: round2(eur) })).sort((a, b) => b.eur.comparedTo(a.eur)),
    byCurrency: [...currencyTotals.entries()].map(([currency, amount]) => ({ currency, amount: round2(amount) })),
    lineCount: txRows.length,
    warnings: { pendingReview, pendingBbva, missingFx, missingFxTotal: missingFx.reduce((a, b) => a + b.count, 0) },
  };
}

/** Rango por defecto (RF-70): desde el fin de la última rendición cerrada (o el primer movimiento sin rendir) hasta hoy. */
export async function defaultRange(db: DbOrTx): Promise<{ dateFrom: string; dateTo: string }> {
  const s = await getSettings(db);
  const today = todayIso(s.timeZone);
  const [last] = await db.select().from(reports).where(eq(reports.status, "cerrado")).orderBy(desc(reports.dateTo)).limit(1);
  if (last) return { dateFrom: addDays(last.dateTo, 1), dateTo: today };
  const [first] = await db
    .select({ date: transactions.date })
    .from(transactions)
    .where(and(isNull(transactions.reportId), or(eq(transactions.kind, "gasto"))))
    .orderBy(asc(transactions.date))
    .limit(1);
  return { dateFrom: first?.date ?? addDays(today, -30), dateTo: today };
}
