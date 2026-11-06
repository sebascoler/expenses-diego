"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { classifyTransactions } from "@/lib/classify/pipeline";
import { getDb } from "@/lib/db/client";
import { rules } from "@/lib/db/schema";
import { counters } from "@/lib/queries";
import {
  acceptHighConfidence,
  acceptSuggestions,
  addManualExpense,
  deleteManualExpense,
  markRuleOffered,
  resolvePossibleMatch,
  setApplies,
  setCategory,
  setNote,
  setSurcharge,
  setTrip,
  type RuleOffer,
} from "@/lib/tx/mutations";
import { eq, and } from "drizzle-orm";
import { transactions } from "@/lib/db/schema";

const uuid = z.string().uuid();

const updateSchema = z.discriminatedUnion("field", [
  z.object({ id: uuid, field: z.literal("applies"), value: z.boolean().nullable() }),
  z.object({ id: uuid, field: z.literal("trip"), value: uuid.nullable() }),
  z.object({ id: uuid, field: z.literal("category"), value: uuid.nullable() }),
  z.object({ id: uuid, field: z.literal("surcharge"), value: z.boolean() }),
  z.object({ id: uuid, field: z.literal("note"), value: z.string().max(500) }),
  z.object({ id: uuid, field: z.literal("accept"), value: z.literal(true) }),
]);

export type Counters = Awaited<ReturnType<typeof serializedCounters>>;

async function serializedCounters() {
  const c = await counters(await getDb());
  return { review: c.review, empresa: c.empresa, personal: c.personal, pendingBbva: c.pendingBbva, totalEmpresa: c.totalEmpresa.toFixed(2) };
}

export type UpdateResult = { ok: true; offers: RuleOffer[]; counters: Counters; amountEur?: string | null } | { ok: false; error: string };

export async function updateTransactionAction(input: z.input<typeof updateSchema>): Promise<UpdateResult> {
  await requireSession();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const db = await getDb();
  const p = parsed.data;
  let offers: RuleOffer[] = [];
  let amountEur: string | null | undefined;
  switch (p.field) {
    case "applies":
      offers = await setApplies(db, [p.id], p.value, { manual: true });
      break;
    case "accept":
      await acceptSuggestions(db, [p.id]);
      break;
    case "trip":
      await setTrip(db, [p.id], p.value);
      break;
    case "category":
      await setCategory(db, [p.id], p.value);
      break;
    case "surcharge": {
      await setSurcharge(db, p.id, p.value);
      const [row] = await db.select({ eur: transactions.amountEur }).from(transactions).where(eq(transactions.id, p.id));
      amountEur = row?.eur ?? null;
      break;
    }
    case "note":
      await setNote(db, p.id, p.value);
      break;
  }
  return { ok: true, offers, counters: await serializedCounters(), amountEur };
}

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ ids: z.array(uuid).min(1).max(1000), action: z.literal("applies"), value: z.boolean() }),
  z.object({ ids: z.array(uuid).min(1).max(1000), action: z.literal("trip"), value: uuid.nullable() }),
  z.object({ ids: z.array(uuid).min(1).max(1000), action: z.literal("category"), value: uuid.nullable() }),
]);

export async function bulkAction(input: z.input<typeof bulkSchema>): Promise<UpdateResult> {
  await requireSession();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const db = await getDb();
  const p = parsed.data;
  let offers: RuleOffer[] = [];
  if (p.action === "applies") offers = await setApplies(db, p.ids, p.value, { manual: true });
  else if (p.action === "trip") await setTrip(db, p.ids, p.value);
  else await setCategory(db, p.ids, p.value);
  return { ok: true, offers, counters: await serializedCounters() };
}

export async function acceptHighAction(): Promise<{ ok: true; count: number }> {
  await requireSession();
  const count = await acceptHighConfidence(await getDb());
  revalidatePath("/revision");
  return { ok: true, count };
}

const ruleSchema = z.object({ merchant: z.string().min(1).max(200), applies: z.boolean(), create: z.boolean() });

export async function ruleOfferAction(input: z.input<typeof ruleSchema>) {
  await requireSession();
  const p = ruleSchema.parse(input);
  const db = await getDb();
  await markRuleOffered(db, p.merchant, p.applies);
  if (p.create) {
    const [existing] = await db.select().from(rules).where(and(eq(rules.pattern, p.merchant), eq(rules.matchType, "merchant_equals")));
    if (!existing) await db.insert(rules).values({ matchType: "merchant_equals", pattern: p.merchant, applies: p.applies, createdFrom: "aprendida" });
  }
  return { ok: true };
}

export async function resolveMatchAction(input: { id: string; same: boolean }) {
  await requireSession();
  const p = z.object({ id: uuid, same: z.boolean() }).parse(input);
  await resolvePossibleMatch(await getDb(), p.id, p.same);
  revalidatePath("/revision");
  return { ok: true };
}

export async function reclassifyAction() {
  await requireSession();
  const res = await classifyTransactions(await getDb());
  revalidatePath("/revision");
  return { ok: true, ...res };
}

const manualSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().min(1).max(30),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()),
  merchant: z.string().trim().min(1).max(200),
  tripId: z.union([uuid, z.literal("")]).transform((v) => v || null),
  categoryId: z.union([uuid, z.literal("")]).transform((v) => v || null),
  note: z.string().max(500).optional(),
});

export async function addManualAction(_prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireSession();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisá los datos del gasto." };
  try {
    await addManualExpense(await getDb(), parsed.data);
  } catch {
    return { error: "Monto inválido." };
  }
  revalidatePath("/revision");
  return { ok: true };
}

export async function deleteManualAction(id: string) {
  await requireSession();
  await deleteManualExpense(await getDb(), uuid.parse(id));
  revalidatePath("/revision");
  return { ok: true };
}
