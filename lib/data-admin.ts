import "server-only";
import { asc } from "drizzle-orm";
import { safeDecrypt } from "./crypto";
import type { DB } from "./db/client";
import * as s from "./db/schema";
import { ensureBaseData } from "./db/seed-base";
import { audit } from "./audit";

/**
 * "Borrar todos los datos" (§16.9): transacciones, importaciones, perfiles, viajes, km, peajes, rendiciones,
 * reglas, decisiones, tasas cacheadas, sesiones y el usuario. Restaura ajustes y categorías por defecto.
 */
export async function wipeAllData(db: DB) {
  await db.transaction(async (tx) => {
    await tx.delete(s.transactions);
    await tx.delete(s.tripMileage);
    await tx.delete(s.tripTolls);
    await tx.delete(s.reports);
    await tx.delete(s.trips);
    await tx.delete(s.imports);
    await tx.delete(s.importProfiles);
    await tx.delete(s.rules);
    await tx.delete(s.merchantDecisions);
    await tx.delete(s.categories);
    await tx.delete(s.fxRates);
    await tx.delete(s.settings);
    await tx.delete(s.sessions);
    await tx.delete(s.loginAttempts);
    await tx.delete(s.users);
    await tx.delete(s.auditLog);
    await audit(tx, "data.wipe");
  });
  await ensureBaseData(db);
}

/** Exportar todos mis datos (JSON), con descripciones y notas descifradas. Sin hashes ni sesiones. */
export async function exportAllData(db: DB) {
  const txs = await db.select().from(s.transactions).orderBy(asc(s.transactions.date));
  return {
    exportedAt: new Date().toISOString(),
    settings: await db.select().from(s.settings),
    categories: await db.select().from(s.categories),
    rules: await db.select().from(s.rules),
    trips: await db.select().from(s.trips),
    mileage: await db.select().from(s.tripMileage),
    tolls: await db.select().from(s.tripTolls),
    reports: await db.select().from(s.reports),
    imports: await db.select().from(s.imports),
    transactions: txs.map(({ descriptionEnc, noteEnc, dedupKey, dedupKeyPrev, ...rest }) => {
      void dedupKey;
      void dedupKeyPrev;
      return { ...rest, description: safeDecrypt(descriptionEnc), note: safeDecrypt(noteEnc) };
    }),
  };
}
