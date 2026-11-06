import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { toDb } from "../calc/money";
import { txEur } from "../calc/totals";
import type { DbOrTx } from "../db/client";
import { transactions } from "../db/schema";
import { getSettings } from "../settings";

/** Recalcula amount_eur de transacciones no rendidas (después de cambiar recargo, fee o tipo de cambio). */
export async function recomputeEur(db: DbOrTx, ids?: string[]) {
  const s = await getSettings(db);
  const conds = [isNull(transactions.reportId)];
  if (ids) {
    if (ids.length === 0) return;
    conds.push(inArray(transactions.id, ids));
  }
  const rows = await db.select().from(transactions).where(and(...conds));
  for (const r of rows) {
    const eur = txEur(r, { addWiseFee: s.addWiseFee });
    const value = eur ? toDb(eur) : null;
    if (value !== r.amountEur) await db.update(transactions).set({ amountEur: value }).where(eq(transactions.id, r.id));
  }
}
