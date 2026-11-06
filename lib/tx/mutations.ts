import "server-only";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { toDb } from "../calc/money";
import { dedupHmac, encrypt, randomToken } from "../crypto";
import type { DB, DbOrTx } from "../db/client";
import { merchantDecisions, rules, transactions } from "../db/schema";
import { FxResolver } from "../fx";
import { normalizeMerchant } from "../parsers/merchant";
import { parseAmount } from "../parsers/amount";
import { reassignTrips } from "../classify/pipeline";
import { findRule } from "../classify/rules";
import { getSettings } from "../settings";
import { recomputeEur } from "./recompute";
import { txEur } from "../calc/totals";

/** Solo se editan transacciones no rendidas (RF-76). */
const editable = (ids: string[]) => and(inArray(transactions.id, ids), isNull(transactions.reportId));

export interface RuleOffer {
  merchant: string;
  applies: boolean;
}

/**
 * Marca aplica / no aplica. Si es una decisión manual (no aceptar la sugerencia), alimenta el aprendizaje:
 * a la segunda corrección del mismo comercio en el mismo sentido se ofrece crear una regla (RF-35).
 */
export async function setApplies(db: DbOrTx, ids: string[], applies: boolean | null, opts: { manual: boolean } = { manual: true }): Promise<RuleOffer[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(transactions).where(editable(ids));
  await db.update(transactions).set({ applies, updatedAt: new Date() }).where(editable(ids));
  if (!opts.manual || applies === null) return [];
  const offers: RuleOffer[] = [];
  const activeRules = await db.select().from(rules).where(eq(rules.active, true));
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.merchantNormalized)) continue;
    seen.add(r.merchantNormalized);
    const isCorrection = r.suggestedApplies === null || r.suggestedApplies !== applies;
    const [dec] = await db
      .insert(merchantDecisions)
      .values({ merchantNormalized: r.merchantNormalized, applies, categoryId: r.categoryId, count: 1 })
      .onConflictDoUpdate({
        target: [merchantDecisions.merchantNormalized, merchantDecisions.applies],
        set: { count: isCorrection ? sql`${merchantDecisions.count} + 1` : merchantDecisions.count, categoryId: r.categoryId, updatedAt: new Date() },
      })
      .returning();
    const ruleExists = findRule(activeRules, r.merchantNormalized);
    if (isCorrection && dec.count >= 2 && !dec.ruleOffered && !ruleExists && r.merchantNormalized !== "SIN DESCRIPCION") offers.push({ merchant: r.merchantNormalized, applies });
  }
  return offers;
}

export async function markRuleOffered(db: DbOrTx, merchant: string, applies: boolean) {
  await db.update(merchantDecisions).set({ ruleOffered: true }).where(and(eq(merchantDecisions.merchantNormalized, merchant), eq(merchantDecisions.applies, applies)));
}

/** "Aceptar todas las de confianza alta" (RF-43). */
export async function acceptHighConfidence(db: DbOrTx): Promise<number> {
  const res = await db
    .update(transactions)
    .set({ applies: sql`${transactions.suggestedApplies}`, updatedAt: new Date() })
    .where(and(isNull(transactions.reportId), isNull(transactions.applies), eq(transactions.kind, "gasto"), eq(transactions.suggestionConfidence, "alta"), isNotNull(transactions.suggestedApplies)))
    .returning({ id: transactions.id });
  return res.length;
}

export async function acceptSuggestions(db: DbOrTx, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const res = await db
    .update(transactions)
    .set({ applies: sql`${transactions.suggestedApplies}`, updatedAt: new Date() })
    .where(and(editable(ids), isNotNull(transactions.suggestedApplies)))
    .returning({ id: transactions.id });
  return res.length;
}

export async function setTrip(db: DbOrTx, ids: string[], tripId: string | null) {
  if (!ids.length) return;
  if (tripId === null) {
    await db.update(transactions).set({ tripAssignedManually: false, updatedAt: new Date() }).where(editable(ids));
    await reassignTrips(db, ids);
    return;
  }
  await db.update(transactions).set({ tripId, tripAssignedManually: true, tripNeedsReview: false, updatedAt: new Date() }).where(editable(ids));
}

export async function setCategory(db: DbOrTx, ids: string[], categoryId: string | null) {
  if (!ids.length) return;
  await db.update(transactions).set({ categoryId, updatedAt: new Date() }).where(editable(ids));
}

export async function setSurcharge(db: DbOrTx, id: string, enabled: boolean) {
  await db.update(transactions).set({ surchargeEnabled: enabled, updatedAt: new Date() }).where(and(editable([id]), eq(transactions.source, "bbva")));
  await recomputeEur(db, [id]);
}

export async function setNote(db: DbOrTx, id: string, note: string) {
  await db.update(transactions).set({ noteEnc: encrypt(note.trim().slice(0, 500)), updatedAt: new Date() }).where(editable([id]));
}

/** Coincidencia ambigua pendiente↔consolidado (RF-28): Diego confirma si es el mismo gasto. */
export async function resolvePossibleMatch(db: DB, id: string, same: boolean) {
  const [tx] = await db.select().from(transactions).where(editable([id]));
  if (!tx || !tx.possibleMatchId) return;
  if (!same) {
    await db.update(transactions).set({ possibleMatchId: null }).where(eq(transactions.id, id));
    return;
  }
  const [pending] = await db.select().from(transactions).where(eq(transactions.id, tx.possibleMatchId));
  await db.transaction(async (t) => {
    if (pending && !pending.reportId) {
      // El consolidado reemplaza al pendiente, conservando la clasificación y la nota del pendiente.
      await t.delete(transactions).where(eq(transactions.id, pending.id));
      await t
        .update(transactions)
        .set({
          dedupKeyPrev: pending.dedupKey,
          possibleMatchId: null,
          applies: pending.applies ?? tx.applies,
          tripId: pending.tripAssignedManually ? pending.tripId : tx.tripId,
          tripAssignedManually: pending.tripAssignedManually,
          categoryId: pending.categoryId ?? tx.categoryId,
          noteEnc: pending.noteEnc ?? tx.noteEnc,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, id));
    } else {
      // El pendiente ya se rindió: el consolidado se descarta para no facturarlo dos veces.
      await t.delete(transactions).where(eq(transactions.id, id));
    }
  });
}

export interface ManualExpense {
  date: string;
  amount: string;
  currency: string;
  merchant: string;
  tripId: string | null;
  categoryId: string | null;
  note?: string;
}

/** Gasto manual (RF-46): efectivo u otra tarjeta. Fuente = manual, ya marcado como aplica. */
export async function addManualExpense(db: DB, input: ManualExpense): Promise<string> {
  const amount = parseAmount(input.amount);
  if (!amount || amount.isZero()) throw new Error("Monto inválido");
  const s = await getSettings(db);
  const fx = new FxResolver(db);
  const neg = amount.abs().negated();
  const rate = await fx.resolve({ source: "manual", date: input.date, amount: neg, currency: input.currency });
  const calc = { amount: toDb(neg), currency: input.currency, fxRate: rate.fxRate?.toFixed(10) ?? null, feeAmount: null, feeFxRate: null, surchargeEnabled: false, surchargePct: "0", source: "manual" };
  const eur = txEur(calc, { addWiseFee: s.addWiseFee });
  const [row] = await db
    .insert(transactions)
    .values({
      source: "manual",
      dedupKey: dedupHmac(`manual|${randomToken(16)}`),
      date: input.date,
      merchantNormalized: normalizeMerchant(input.merchant),
      descriptionEnc: encrypt(input.merchant),
      amount: calc.amount,
      currency: input.currency,
      kind: "gasto",
      applies: true,
      tripId: input.tripId,
      tripAssignedManually: Boolean(input.tripId),
      categoryId: input.categoryId,
      fxRate: calc.fxRate,
      fxSource: rate.fxSource,
      fxDate: rate.fxDate,
      amountEur: eur ? toDb(eur) : null,
      noteEnc: input.note ? encrypt(input.note) : null,
    })
    .returning({ id: transactions.id });
  if (!input.tripId) await reassignTrips(db, [row.id]);
  return row.id;
}

export async function deleteManualExpense(db: DbOrTx, id: string) {
  await db.delete(transactions).where(and(editable([id]), eq(transactions.source, "manual")));
}
