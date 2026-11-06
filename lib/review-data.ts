import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { safeDecrypt } from "./crypto";
import type { DbOrTx } from "./db/client";
import { categories, reports, transactions, trips } from "./db/schema";

export const FILTERS = ["revisar", "empresa", "personal", "viaje", "fuente", "pendientes", "rendidos", "no_gasto", "todos"] as const;
export type Filter = (typeof FILTERS)[number];

export interface ReviewRow {
  id: string;
  date: string;
  merchant: string;
  description: string | null;
  amount: string;
  currency: string;
  amountEur: string | null;
  fxSource: string;
  source: "wise" | "bbva" | "manual";
  cardLast4: string | null;
  cardType: "fisica" | "virtual" | null;
  bankStatus: "pendiente" | "consolidado" | null;
  kind: "gasto" | "no_gasto";
  applies: boolean | null;
  suggestedApplies: boolean | null;
  suggestionConfidence: "alta" | "media" | "baja" | null;
  suggestionReason: string | null;
  tripId: string | null;
  tripNeedsReview: boolean;
  categoryId: string | null;
  surchargeEnabled: boolean;
  surchargePct: string;
  note: string;
  rendered: boolean;
  possibleMatch: { date: string; amount: string } | null;
}

export async function loadReview(db: DbOrTx, filter: Filter, opts: { tripId?: string; source?: string }) {
  const conds: SQL[] = [];
  if (filter !== "no_gasto") conds.push(eq(transactions.kind, "gasto"));
  switch (filter) {
    case "revisar":
      conds.push(isNull(transactions.applies), isNull(transactions.reportId));
      break;
    case "empresa":
      conds.push(eq(transactions.applies, true), isNull(transactions.reportId));
      break;
    case "personal":
      conds.push(eq(transactions.applies, false));
      break;
    case "viaje":
      if (opts.tripId) conds.push(eq(transactions.tripId, opts.tripId));
      break;
    case "fuente":
      if (opts.source === "wise" || opts.source === "bbva" || opts.source === "manual") conds.push(eq(transactions.source, opts.source));
      break;
    case "pendientes":
      conds.push(eq(transactions.bankStatus, "pendiente"));
      break;
    case "rendidos":
      conds.push(isNotNull(transactions.reportId));
      break;
    case "no_gasto":
      conds.push(eq(transactions.kind, "no_gasto"));
      break;
  }
  const order =
    filter === "revisar"
      ? // Primero las sin clasificar (RF-34), después por fecha
        [asc(sql`${transactions.suggestionSource} is not null`), desc(transactions.date)]
      : [desc(transactions.date)];
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(...order)
    .limit(600);
  const matchIds = rows.map((r) => r.possibleMatchId).filter(Boolean) as string[];
  const matches = matchIds.length ? await db.select({ id: transactions.id, date: transactions.date, amount: transactions.amount }).from(transactions).where(inArray(transactions.id, matchIds)) : [];
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const data: ReviewRow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    merchant: r.merchantNormalized,
    description: safeDecrypt(r.descriptionEnc),
    amount: r.amount.replace(/^-/, ""),
    currency: r.currency,
    amountEur: r.amountEur,
    fxSource: r.fxSource,
    source: r.source,
    cardLast4: r.cardLast4,
    cardType: r.cardType,
    bankStatus: r.bankStatus,
    kind: r.kind,
    applies: r.applies,
    suggestedApplies: r.suggestedApplies,
    suggestionConfidence: r.suggestionConfidence,
    suggestionReason: r.suggestionReason,
    tripId: r.tripId,
    tripNeedsReview: r.tripNeedsReview,
    categoryId: r.categoryId,
    surchargeEnabled: r.surchargeEnabled,
    surchargePct: r.surchargePct,
    note: safeDecrypt(r.noteEnc) ?? "",
    rendered: Boolean(r.reportId),
    possibleMatch: r.possibleMatchId && matchMap.get(r.possibleMatchId) ? { date: matchMap.get(r.possibleMatchId)!.date, amount: matchMap.get(r.possibleMatchId)!.amount.replace(/^-/, "") } : null,
  }));
  const tripList = await db.select({ id: trips.id, name: trips.name, isGeneral: trips.isGeneral, dateFrom: trips.dateFrom }).from(trips).orderBy(asc(trips.isGeneral), desc(trips.dateFrom));
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.active, true)).orderBy(asc(categories.sortOrder));
  const openReports = await db.select({ id: reports.id }).from(reports).limit(1);
  return { rows: data, trips: tripList, categories: cats, hasReports: openReports.length > 0 };
}
