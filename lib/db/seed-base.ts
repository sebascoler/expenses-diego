import { eq } from "drizzle-orm";
import type { DbOrTx } from "./client";
import { categories, trips } from "./schema";

export const DEFAULT_CATEGORIES = [
  "Pasajes aéreos",
  "Alojamiento",
  "Transporte local (taxi/Uber/bus)",
  "Combustible",
  "Alquiler de auto",
  "Peajes",
  "Comidas",
  "Comunicaciones",
  "Compras oficina/terceros",
  "Otros",
];

export const GENERAL_TRIP_NAME = "Gastos generales / oficina";

/** Datos base idempotentes: categorías iniciales (§5.4) y el viaje fijo "Gastos generales" (RF-52). */
export async function ensureBaseData(db: DbOrTx) {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1);
  if (existing.length === 0) {
    await db
      .insert(categories)
      .values(DEFAULT_CATEGORIES.map((name, i) => ({ name, sortOrder: i })))
      .onConflictDoNothing();
  }
  const general = await db.select({ id: trips.id }).from(trips).where(eq(trips.isGeneral, true)).limit(1);
  if (general.length === 0) await db.insert(trips).values({ name: GENERAL_TRIP_NAME, isGeneral: true });
}
