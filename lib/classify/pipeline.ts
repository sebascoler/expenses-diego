import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { categories, merchantDecisions, rules, transactions, trips, type Transaction } from "../db/schema";
import { cardTypeFor, getSettings } from "../settings";
import { classifyWithAi, isAiEnabled, type AiItem } from "./ai";
import { cardSuggestion } from "./card";
import { categoryHint, findRule } from "./rules";
import { assignTrip, type TripRange } from "./trips";

export async function loadTrips(db: DbOrTx): Promise<{ list: TripRange[]; generalId: string | null }> {
  const list = await db.select().from(trips);
  return { list, generalId: list.find((t) => t.isGeneral)?.id ?? null };
}

/** Re-asigna por fecha las transacciones no rendidas que no se asignaron a mano (RF-51). */
export async function reassignTrips(db: DbOrTx, txIds?: string[]) {
  const { list, generalId } = await loadTrips(db);
  const conds = [isNull(transactions.reportId), eq(transactions.tripAssignedManually, false)];
  if (txIds) {
    if (txIds.length === 0) return;
    conds.push(inArray(transactions.id, txIds));
  }
  const rows = await db.select({ id: transactions.id, date: transactions.date, tripId: transactions.tripId, needs: transactions.tripNeedsReview }).from(transactions).where(and(...conds));
  for (const r of rows) {
    const a = assignTrip(r.date, list, generalId);
    if (a.tripId !== r.tripId || a.needsReview !== r.needs)
      await db.update(transactions).set({ tripId: a.tripId, tripNeedsReview: a.needsReview, updatedAt: new Date() }).where(eq(transactions.id, r.id));
  }
}

export interface ClassifyOptions {
  txIds?: string[];
  useAi?: boolean;
}

/**
 * Clasificación híbrida (§5.4): reglas del usuario → regla de tarjeta → IA.
 * Solo propone (suggested_applies); la decisión (`applies`) es siempre de Diego.
 * Nunca toca filas rendidas ni filas con `applies` ya decidido.
 */
export async function classifyTransactions(db: DbOrTx, opts: ClassifyOptions = {}): Promise<{ classified: number; ai: number }> {
  const s = await getSettings(db);
  const conds = [isNull(transactions.reportId), eq(transactions.kind, "gasto"), isNull(transactions.applies)];
  if (opts.txIds) {
    if (opts.txIds.length === 0) return { classified: 0, ai: 0 };
    conds.push(inArray(transactions.id, opts.txIds));
  }
  const rows = await db.select().from(transactions).where(and(...conds));
  await reassignTrips(db, rows.map((r) => r.id));
  const fresh = rows.length ? await db.select().from(transactions).where(inArray(transactions.id, rows.map((r) => r.id))) : [];

  const ruleList = await db.select().from(rules).where(eq(rules.active, true));
  const cats = await db.select().from(categories).where(eq(categories.active, true));
  const catByName = new Map(cats.map((c) => [c.name, c.id]));
  const catNameById = new Map(cats.map((c) => [c.id, c.name]));
  const { list: tripList } = await loadTrips(db);
  const tripById = new Map(tripList.map((t) => [t.id, t]));

  const pendingAi: Transaction[] = [];
  let classified = 0;
  for (const tx of fresh) {
    const cardType = tx.source === "bbva" ? cardTypeFor(s, tx.cardLast4) : tx.cardType;
    const rule = findRule(ruleList, tx.merchantNormalized);
    const hintCat = catByName.get(categoryHint(tx.merchantNormalized) ?? "") ?? null;
    let patch: Partial<Transaction> = { cardType };
    if (rule) {
      patch = {
        ...patch,
        suggestedApplies: rule.applies,
        suggestionSource: "regla",
        suggestionConfidence: "alta",
        suggestionReason: `regla: ${rule.pattern} → ${rule.applies === false ? "personal" : rule.applies ? "empresa" : "categoría"}`.slice(0, 120),
        categoryId: rule.categoryId ?? tx.categoryId ?? hintCat,
      };
      await db.update(rules).set({ hits: sql`${rules.hits} + 1` }).where(eq(rules.id, rule.id));
      if (rule.applies === null) pendingAi.push(tx);
      classified++;
    } else if (cardSuggestion(cardType)) {
      const c = cardSuggestion(cardType)!;
      patch = { ...patch, suggestedApplies: c.applies, suggestionSource: "tarjeta", suggestionConfidence: c.confidence, suggestionReason: c.reason, categoryId: tx.categoryId ?? hintCat };
      classified++;
    } else {
      patch = { ...patch, categoryId: tx.categoryId ?? hintCat };
      if (tx.suggestionSource !== "ia") {
        patch.suggestedApplies = null;
        patch.suggestionSource = null;
        patch.suggestionConfidence = null;
        patch.suggestionReason = null;
      }
      pendingAi.push(tx);
    }
    await db.update(transactions).set({ ...patch, updatedAt: new Date() }).where(eq(transactions.id, tx.id));
  }

  let aiCount = 0;
  if (opts.useAi !== false && pendingAi.length > 0 && isAiEnabled()) {
    const decisions = await db.select().from(merchantDecisions).orderBy(desc(merchantDecisions.updatedAt)).limit(20);
    const items: AiItem[] = pendingAi.map((tx, i) => {
      const trip = tx.tripId ? tripById.get(tx.tripId) : undefined;
      return {
        id: i,
        fecha: tx.date,
        comercio: tx.merchantNormalized,
        monto: tx.amount.replace(/^-/, ""),
        moneda: tx.currency,
        fuente: tx.source,
        tipo_tarjeta: tx.source === "bbva" ? cardTypeFor(s, tx.cardLast4) : null,
        viaje_candidato: trip && !trip.isGeneral ? { nombre: trip.name, destino: trip.destination } : null,
      };
    });
    const suggestions = await classifyWithAi(items, {
      categories: cats.map((c) => c.name),
      trips: tripList.filter((t) => !t.isGeneral).map((t) => ({ nombre: t.name, destino: t.destination, desde: t.dateFrom, hasta: t.dateTo })),
      decisions: decisions.map((dd) => ({ comercio: dd.merchantNormalized, aplica: dd.applies, categoria: dd.categoryId ? (catNameById.get(dd.categoryId) ?? null) : null })),
    });
    for (const [idx, sug] of suggestions) {
      const tx = pendingAi[idx];
      if (!tx) continue;
      const ruleDecided = tx.suggestionSource === "regla";
      await db
        .update(transactions)
        .set({
          ...(ruleDecided
            ? {}
            : { suggestedApplies: sug.applies, suggestionSource: "ia" as const, suggestionConfidence: sug.confidence, suggestionReason: sug.reason }),
          ...(sug.category && catByName.get(sug.category) && !tx.categoryId ? { categoryId: catByName.get(sug.category)! } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, tx.id), isNull(transactions.applies), isNull(transactions.reportId)));
      aiCount++;
    }
  }
  return { classified, ai: aiCount };
}
