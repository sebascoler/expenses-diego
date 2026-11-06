"use server";

import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { toDb } from "@/lib/calc/money";
import { reassignTrips } from "@/lib/classify/pipeline";
import { getDb } from "@/lib/db/client";
import { transactions, tripMileage, tripTolls, trips } from "@/lib/db/schema";
import { FxResolver } from "@/lib/fx";
import { parseAmount } from "@/lib/parsers/amount";
import { getSettings } from "@/lib/settings";
import { todayIso } from "@/lib/format";

type State = { error?: string; ok?: boolean } | undefined;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const tripSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    name: z.string().trim().min(1, "Poné un nombre").max(120),
    destination: z.string().trim().max(120).optional(),
    dateFrom: isoDate,
    dateTo: isoDate,
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.dateFrom <= v.dateTo, { message: "La fecha desde tiene que ser anterior a la fecha hasta." });

export async function saveTripAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const parsed = tripSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const db = await getDb();
  const v = parsed.data;
  let id = v.id;
  if (id) {
    await db.update(trips).set({ name: v.name, destination: v.destination || null, dateFrom: v.dateFrom, dateTo: v.dateTo, notes: v.notes || null }).where(and(eq(trips.id, id), eq(trips.isGeneral, false)));
  } else {
    const [row] = await db.insert(trips).values({ name: v.name, destination: v.destination || null, dateFrom: v.dateFrom, dateTo: v.dateTo, notes: v.notes || null }).returning({ id: trips.id });
    id = row.id;
    await audit(db, "trip.create", "trips", id);
  }
  // RF-51: se re-asignan las transacciones del rango que no fueron asignadas a mano
  await reassignTrips(db);
  revalidatePath("/viajes");
  redirect(`/viajes/${id}`);
}

export async function deleteTripAction(id: string) {
  await requireSession();
  const db = await getDb();
  const tripId = z.string().uuid().parse(id);
  const [rendered] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.tripId, tripId), isNotNull(transactions.reportId)))
    .limit(1);
  const [renderedKm] = await db.select({ id: tripMileage.id }).from(tripMileage).where(and(eq(tripMileage.tripId, tripId), isNotNull(tripMileage.reportId))).limit(1);
  const [renderedToll] = await db.select({ id: tripTolls.id }).from(tripTolls).where(and(eq(tripTolls.tripId, tripId), isNotNull(tripTolls.reportId))).limit(1);
  if (rendered || renderedKm || renderedToll) return { error: "El viaje tiene gastos rendidos: reabrí la rendición antes de borrarlo." };
  await db.update(transactions).set({ tripAssignedManually: false }).where(eq(transactions.tripId, tripId));
  await db.delete(trips).where(and(eq(trips.id, tripId), eq(trips.isGeneral, false)));
  await reassignTrips(db);
  revalidatePath("/viajes");
  redirect("/viajes");
}

const kmSchema = z.object({
  tripId: z.string().uuid(),
  kmTotal: z.string().min(1),
  kmDeduction: z.string().optional(),
  reason: z.string().max(200).optional(),
});

export async function addMileageAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const parsed = kmSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Datos inválidos" };
  const total = parseAmount(parsed.data.kmTotal);
  const ded = parseAmount(parsed.data.kmDeduction || "0") ?? parseAmount("0")!;
  if (!total || total.isNegative() || ded.isNegative()) return { error: "Los km tienen que ser números positivos." };
  if (ded.gt(total)) return { error: "Los km a descontar no pueden superar los km totales." };
  const db = await getDb();
  const s = await getSettings(db);
  await db.insert(tripMileage).values({ tripId: parsed.data.tripId, kmTotal: toDb(total), kmDeduction: toDb(ded), deductionReason: parsed.data.reason || null, rateEur: s.kmRateEur });
  revalidatePath(`/viajes/${parsed.data.tripId}`);
  return { ok: true };
}

const tollSchema = z.object({
  tripId: z.string().uuid(),
  amount: z.string().min(1),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
  date: z.union([isoDate, z.literal("")]).optional(),
  note: z.string().max(200).optional(),
});

export async function addTollAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const parsed = tollSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Datos inválidos" };
  const amount = parseAmount(parsed.data.amount);
  if (!amount || amount.isZero()) return { error: "Monto inválido" };
  const db = await getDb();
  const s = await getSettings(db);
  const [trip] = await db.select().from(trips).where(eq(trips.id, parsed.data.tripId));
  const date = parsed.data.date || trip?.dateTo || todayIso(s.timeZone);
  const fx = await new FxResolver(db).toEur(parsed.data.currency, date);
  await db.insert(tripTolls).values({
    tripId: parsed.data.tripId,
    amount: toDb(amount.abs()),
    currency: parsed.data.currency,
    date: parsed.data.date || null,
    note: parsed.data.note || null,
    fxRate: fx.rate ? fx.rate.toFixed(10) : null,
    fxSource: fx.source,
  });
  revalidatePath(`/viajes/${parsed.data.tripId}`);
  return { ok: true };
}

export async function deleteExtraAction(kind: "km" | "toll", id: string, tripId: string) {
  await requireSession();
  const db = await getDb();
  const uuid = z.string().uuid().parse(id);
  if (kind === "km") await db.delete(tripMileage).where(and(eq(tripMileage.id, uuid), isNull(tripMileage.reportId)));
  else await db.delete(tripTolls).where(and(eq(tripTolls.id, uuid), or(isNull(tripTolls.reportId))));
  revalidatePath(`/viajes/${tripId}`);
  return { ok: true };
}
