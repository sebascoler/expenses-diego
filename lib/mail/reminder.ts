import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { audit } from "../audit";
import { d, round2 } from "../calc/money";
import type { DbOrTx } from "../db/client";
import { imports, transactions } from "../db/schema";
import { env } from "../env";
import { addDays, formatDate, formatMoney } from "../format";
import { sourceStatus } from "../queries";
import { getSettings, updateSettings, type Settings } from "../settings";

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, day: Number(get("day")), hour: Number(get("hour")) };
}

/**
 * Decide qué mandar hoy (RF-80, RF-82). El cron corre una vez por día; el mail sale el día configurado
 * (o el siguiente, si el cron llegó antes de la hora) y el segundo aviso a los 3 días si no hubo importación.
 */
export async function reminderDue(db: DbOrTx, s: Settings, now = new Date()): Promise<"first" | "second" | null> {
  const local = localParts(now, s.timeZone);
  const monthStart = local.date.slice(0, 8) + String(s.reminderDay).padStart(2, "0");
  if (local.date >= monthStart && s.lastReminderSentOn !== null && s.lastReminderSentOn >= monthStart) {
    // Ya se mandó el primero este mes: ¿corresponde el segundo?
    if (!s.reminderSecondNotice) return null;
    if (s.lastSecondReminderSentOn && s.lastSecondReminderSentOn >= monthStart) return null;
    if (local.date < addDays(s.lastReminderSentOn, 3)) return null;
    const [imp] = await db
      .select({ id: imports.id })
      .from(imports)
      .where(gt(imports.createdAt, new Date(`${s.lastReminderSentOn}T00:00:00Z`)))
      .limit(1);
    return imp ? null : "second";
  }
  if (local.date < monthStart) return null;
  if (local.date === monthStart && local.hour < s.reminderHour) return null;
  // Si el cron falló el día exacto, se manda en los días siguientes del mismo mes.
  return "first";
}

export async function buildReminder(db: DbOrTx, kind: "first" | "second" | "test") {
  const status = await sourceStatus(db);
  const [c] = await db
    .select({
      count: sql<number>`count(*) filter (where ${transactions.applies} is distinct from false)::int`,
      total: sql<string | null>`sum(${transactions.amountEur}) filter (where ${transactions.applies} = true)`,
      pending: sql<number>`count(*) filter (where ${transactions.bankStatus} = 'pendiente')::int`,
    })
    .from(transactions)
    .where(and(isNull(transactions.reportId), eq(transactions.kind, "gasto")));
  const wise = status.wise ? `Wise: ${formatDate(status.wise).slice(0, 5)}` : "Wise: sin datos";
  const bbva = status.bbva ? `BBVA: ${formatDate(status.bbva).slice(0, 5)}` : "BBVA: sin datos";
  const bbvaFrom = status.bbvaConsolidated ?? status.bbva;
  const lines = [
    kind === "second" ? "Recordatorio: todavía no subiste los movimientos de este mes." : "Es momento de rendir los gastos.",
    "",
    `Último movimiento cargado: ${wise} · ${bbva}`,
    status.bbva ? `Bajá el Excel de BBVA desde el ${formatDate(bbvaFrom)} hasta hoy.` : "Bajá el Excel de movimientos de BBVA de los últimos meses.",
    status.wise ? `Bajá el CSV de Wise desde el ${formatDate(status.wise)} hasta hoy.` : "Bajá el extracto CSV de Wise de los últimos meses.",
    "",
    `Gastos sin rendir: ${c?.count ?? 0} (total estimado de empresa: ${formatMoney(round2(d(c?.total ?? 0)).toFixed(2))}).`,
    ...(c?.pending ? [`Hay ${c.pending} movimientos de BBVA pendientes: conviene volver a bajarlos porque probablemente ya se consolidaron.`] : []),
    "",
    `Entrá acá: ${env.appUrl}`,
  ];
  // RF-83: solo cantidades y totales, nunca detalle de transacciones.
  const subject = kind === "second" ? "Recordatorio: faltan los movimientos para la rendición" : kind === "test" ? "[Prueba] Es momento de rendir los gastos" : "Es momento de rendir los gastos";
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${lines.map((l) => (l ? `<p style="margin:0 0 8px">${escapeHtml(l)}</p>` : "")).join("")}<p><a href="${escapeHtml(env.appUrl)}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir la app</a></p></div>`;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function runReminder(db: DbOrTx, opts: { now?: Date; test?: boolean } = {}) {
  const { sendMail } = await import("./send");
  const s = await getSettings(db);
  const kind = opts.test ? "test" : await reminderDue(db, s, opts.now);
  if (!kind) return { sent: false, kind: null, reason: "No corresponde hoy" };
  const mail = await buildReminder(db, kind);
  const res = await sendMail({ to: [s.reminderEmail], subject: mail.subject, text: mail.text, html: mail.html });
  if (kind !== "test") {
    const today = localParts(opts.now ?? new Date(), s.timeZone).date;
    // Se registra aunque el mail no esté configurado, para no reintentar todos los días.
    await updateSettings(kind === "first" ? { lastReminderSentOn: today, lastSecondReminderSentOn: null } : { lastSecondReminderSentOn: today }, db);
  }
  await audit(db, "reminder", "settings", kind, { sent: res.sent });
  return { sent: res.sent, kind, reason: res.reason };
}
