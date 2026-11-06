import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { d, round2 } from "./calc/money";
import type { DbOrTx } from "./db/client";
import { imports, reports, transactions, trips } from "./db/schema";

export async function sourceStatus(db: DbOrTx) {
  const rows = await db
    .select({ source: transactions.source, last: sql<string | null>`max(${transactions.date})`, lastConsolidated: sql<string | null>`max(${transactions.date}) filter (where ${transactions.bankStatus} is distinct from 'pendiente')` })
    .from(transactions)
    .where(sql`${transactions.source} <> 'manual'`)
    .groupBy(transactions.source);
  const [lastImport] = await db.select({ at: imports.createdAt }).from(imports).orderBy(desc(imports.createdAt)).limit(1);
  const by = new Map(rows.map((r) => [r.source, r]));
  return {
    wise: by.get("wise")?.last ?? null,
    bbva: by.get("bbva")?.last ?? null,
    bbvaConsolidated: by.get("bbva")?.lastConsolidated ?? null,
    lastImportAt: lastImport?.at ?? null,
  };
}

export async function counters(db: DbOrTx) {
  const [c] = await db
    .select({
      review: sql<number>`count(*) filter (where ${transactions.applies} is null)::int`,
      empresa: sql<number>`count(*) filter (where ${transactions.applies} = true)::int`,
      personal: sql<number>`count(*) filter (where ${transactions.applies} = false)::int`,
      pendingBbva: sql<number>`count(*) filter (where ${transactions.bankStatus} = 'pendiente')::int`,
      totalEmpresa: sql<string | null>`sum(${transactions.amountEur}) filter (where ${transactions.applies} = true)`,
      missingFx: sql<number>`count(*) filter (where ${transactions.applies} = true and ${transactions.fxSource} = 'pendiente')::int`,
    })
    .from(transactions)
    .where(and(isNull(transactions.reportId), eq(transactions.kind, "gasto")));
  return { ...c, totalEmpresa: round2(d(c?.totalEmpresa ?? 0)) };
}

export async function listTrips(db: DbOrTx) {
  return db.select().from(trips).orderBy(asc(trips.isGeneral), desc(trips.dateFrom));
}

export async function lastClosedReport(db: DbOrTx) {
  const [r] = await db.select().from(reports).where(eq(reports.status, "cerrado")).orderBy(desc(reports.dateTo)).limit(1);
  return r ?? null;
}
