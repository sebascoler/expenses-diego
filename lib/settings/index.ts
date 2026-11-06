import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "../db/client";
import { settings } from "../db/schema";

export const cardSchema = z.object({ last4: z.string().regex(/^\d{4}$/), type: z.enum(["fisica", "virtual"]), label: z.string().max(40).optional() });

export const settingsSchema = z.object({
  kmRateEur: z.string().regex(/^\d+(\.\d+)?$/).default("0.35"),
  bbvaSurchargePct: z.string().regex(/^\d+(\.\d+)?$/).default("3"),
  addWiseFee: z.boolean().default(true),
  bbvaCards: z.array(cardSchema).default([]),
  reminderDay: z.number().int().min(1).max(28).default(20),
  reminderHour: z.number().int().min(0).max(23).default(9),
  reminderSecondNotice: z.boolean().default(true),
  reminderEmail: z.string().default(""),
  reportRecipientEmail: z.string().default(""),
  timeZone: z.string().default("America/Argentina/Buenos_Aires"),
  reportName: z.string().default("Diego Castagnasso"),
  lastReminderSentOn: z.string().nullable().default(null),
  lastSecondReminderSentOn: z.string().nullable().default(null),
});

export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export async function getSettings(db?: DbOrTx): Promise<Settings> {
  const conn = db ?? (await getDb());
  const rows = await conn.select().from(settings);
  const raw: Record<string, unknown> = {};
  // Los valores se guardan envueltos en { v } (drizzle parsea los strings jsonb como JSON).
  for (const r of rows) raw[r.key] = r.value && typeof r.value === "object" && "v" in (r.value as object) ? (r.value as { v: unknown }).v : r.value;
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Si un valor guardado es inválido, se usa el default de esa clave.
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(raw)) {
    const field = (settingsSchema.shape as Record<string, z.ZodType>)[k];
    if (field && field.safeParse(v).success) out[k] = v;
  }
  return out as Settings;
}

export async function updateSettings(patch: Partial<Settings>, db?: DbOrTx): Promise<Settings> {
  const conn = db ?? (await getDb());
  const shape = settingsSchema.shape as Record<string, z.ZodType>;
  // Solo se validan y guardan las claves que vienen en el cambio (zod 4: partial() conserva los defaults).
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined || !shape[key]) continue;
    const value = shape[key].parse(raw);
    const json = sql`${JSON.stringify({ v: value })}::jsonb`;
    await conn
      .insert(settings)
      .values({ key, value: json })
      .onConflictDoUpdate({ target: settings.key, set: { value: json } });
  }
  return getSettings(conn);
}

export function cardTypeFor(s: Settings, last4: string | null | undefined): "fisica" | "virtual" | null {
  if (!last4) return null;
  return s.bbvaCards.find((c) => c.last4 === last4)?.type ?? null;
}
