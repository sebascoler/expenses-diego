"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, requireSession, revokeOtherSessions } from "@/lib/auth/session";
import { classifyTransactions } from "@/lib/classify/pipeline";
import { wipeAllData } from "@/lib/data-admin";
import { getDb } from "@/lib/db/client";
import { categories, rules, transactions, users } from "@/lib/db/schema";
import { runReminder } from "@/lib/mail/reminder";
import { parseAmount } from "@/lib/parsers/amount";
import { getSettings, updateSettings } from "@/lib/settings";
import { recomputeEur } from "@/lib/tx/recompute";

type State = { error?: string; ok?: string } | undefined;

const num = (label: string) =>
  z.string().transform((v, ctx) => {
    const n = parseAmount(v);
    if (!n || n.isNegative()) {
      ctx.addIssue({ code: "custom", message: `${label} inválido` });
      return z.NEVER;
    }
    return n.toString();
  });

const generalSchema = z.object({
  kmRateEur: num("Tarifa por km"),
  bbvaSurchargePct: num("Recargo BBVA"),
  addWiseFee: z.enum(["on"]).optional(),
  reminderDay: z.coerce.number().int().min(1).max(28),
  reminderHour: z.coerce.number().int().min(0).max(23),
  reminderSecondNotice: z.enum(["on"]).optional(),
  reminderEmail: z.union([z.string().email("Email del recordatorio inválido"), z.literal("")]),
  reportRecipientEmail: z.union([z.string().email("Email del destinatario inválido"), z.literal("")]),
  timeZone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria inválida"),
  reportName: z.string().trim().min(1).max(100),
});

export async function saveSettingsAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const p = generalSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const db = await getDb();
  const before = await getSettings(db);
  const v = p.data;
  await updateSettings(
    {
      kmRateEur: v.kmRateEur,
      bbvaSurchargePct: v.bbvaSurchargePct,
      addWiseFee: v.addWiseFee === "on",
      reminderDay: v.reminderDay,
      reminderHour: v.reminderHour,
      reminderSecondNotice: v.reminderSecondNotice === "on",
      reminderEmail: v.reminderEmail,
      reportRecipientEmail: v.reportRecipientEmail,
      timeZone: v.timeZone,
      reportName: v.reportName,
    },
    db,
  );
  if (before.bbvaSurchargePct !== v.bbvaSurchargePct)
    await db.update(transactions).set({ surchargePct: v.bbvaSurchargePct }).where(and(eq(transactions.source, "bbva"), isNull(transactions.reportId)));
  if (before.bbvaSurchargePct !== v.bbvaSurchargePct || before.addWiseFee !== (v.addWiseFee === "on")) await recomputeEur(db);
  revalidatePath("/ajustes");
  return { ok: "Ajustes guardados." };
}

export async function saveCardsAction(input: { cards: { last4: string; type: "fisica" | "virtual"; label?: string }[] }) {
  await requireSession();
  const cards = z.array(z.object({ last4: z.string().regex(/^\d{4}$/), type: z.enum(["fisica", "virtual"]), label: z.string().max(40).optional() })).max(10).parse(input.cards);
  const db = await getDb();
  await updateSettings({ bbvaCards: cards }, db);
  // La regla de tarjeta se re-evalúa para lo que está por revisar.
  await classifyTransactions(db, { useAi: false });
  revalidatePath("/ajustes");
  return { ok: true };
}

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  matchType: z.enum(["merchant_equals", "merchant_contains", "regex"]),
  pattern: z.string().trim().min(1).max(200),
  applies: z.enum(["true", "false", ""]).transform((v) => (v === "" ? null : v === "true")),
  categoryId: z.union([z.string().uuid(), z.literal("")]).transform((v) => v || null),
});

export async function saveRuleAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const p = ruleSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Regla inválida" };
  if (p.data.matchType === "regex") {
    try {
      new RegExp(p.data.pattern, "i");
    } catch {
      return { error: "La expresión regular no es válida." };
    }
  }
  if (p.data.applies === null && !p.data.categoryId) return { error: "La regla tiene que decidir si aplica o asignar una categoría." };
  const db = await getDb();
  const { id, ...values } = p.data;
  if (id) await db.update(rules).set(values).where(eq(rules.id, id));
  else await db.insert(rules).values({ ...values, createdFrom: "manual" });
  await classifyTransactions(db, { useAi: false });
  revalidatePath("/ajustes");
  return { ok: "Regla guardada." };
}

export async function toggleRuleAction(id: string, active: boolean) {
  await requireSession();
  const db = await getDb();
  await db.update(rules).set({ active }).where(eq(rules.id, z.string().uuid().parse(id)));
  revalidatePath("/ajustes");
}

export async function deleteRuleAction(id: string) {
  await requireSession();
  await (await getDb()).delete(rules).where(eq(rules.id, z.string().uuid().parse(id)));
  revalidatePath("/ajustes");
}

export async function saveCategoryAction(_prev: State, fd: FormData): Promise<State> {
  await requireSession();
  const p = z.object({ id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)), name: z.string().trim().min(1).max(60) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Nombre inválido" };
  const db = await getDb();
  try {
    if (p.data.id) await db.update(categories).set({ name: p.data.name }).where(eq(categories.id, p.data.id));
    else await db.insert(categories).values({ name: p.data.name, sortOrder: 100 });
  } catch {
    return { error: "Ya existe una categoría con ese nombre." };
  }
  revalidatePath("/ajustes");
  return { ok: "Categoría guardada." };
}

export async function toggleCategoryAction(id: string, active: boolean) {
  await requireSession();
  await (await getDb()).update(categories).set({ active }).where(eq(categories.id, z.string().uuid().parse(id)));
  revalidatePath("/ajustes");
}

export async function changePasswordAction(_prev: State, fd: FormData): Promise<State> {
  const session = await requireSession();
  const p = z.object({ current: z.string().min(1), next: z.string(), confirm: z.string() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Completá los campos." };
  if (p.data.next.length < MIN_PASSWORD_LENGTH) return { error: `La contraseña nueva tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (p.data.next !== p.data.confirm) return { error: "Las contraseñas nuevas no coinciden." };
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !(await verifyPassword(user.passwordHash, p.data.current))) return { error: "La contraseña actual no es correcta." };
  await db.update(users).set({ passwordHash: await hashPassword(p.data.next), passwordChangedAt: new Date() }).where(eq(users.id, user.id));
  // RF-04: se invalidan las demás sesiones
  await revokeOtherSessions(db, user.id, session.sessionId);
  await audit(db, "user.password_change", "users", user.id);
  return { ok: "Contraseña cambiada. Se cerraron las demás sesiones." };
}

export async function testReminderAction(): Promise<State> {
  await requireSession();
  const db = await getDb();
  const s = await getSettings(db);
  if (!s.reminderEmail) return { error: "Primero cargá el email del recordatorio." };
  const r = await runReminder(db, { test: true });
  return r.sent ? { ok: "Recordatorio de prueba enviado." } : { error: `No se envió: ${r.reason ?? "error"}.` };
}

export async function wipeDataAction(_prev: State, fd: FormData): Promise<State> {
  const session = await requireSession();
  const p = z.object({ password: z.string().min(1), confirm: z.string() }).safeParse(Object.fromEntries(fd));
  if (!p.success || p.data.confirm !== "BORRAR") return { error: "Escribí BORRAR para confirmar." };
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !(await verifyPassword(user.passwordHash, p.data.password))) return { error: "La contraseña no es correcta." };
  await wipeAllData(db);
  await clearSessionCookie();
  redirect("/login");
}
