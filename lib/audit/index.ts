import "server-only";
import type { DbOrTx } from "../db/client";
import { auditLog } from "../db/schema";

/** Registra una acción. `meta` nunca debe contener datos de transacciones ni PII. */
export async function audit(db: DbOrTx, action: string, entity?: string, entityId?: string, meta: Record<string, string | number | boolean | null> = {}) {
  await db.insert(auditLog).values({ action, entity, entityId, meta });
}
