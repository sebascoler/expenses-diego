import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { toDb } from "../calc/money";
import { audit } from "../audit";
import type { DB } from "../db/client";
import { reports, transactions, tripMileage, tripTolls, type Report } from "../db/schema";
import { buildReport } from "./build";
import { emailDraft } from "./email-draft";

export class ReportError extends Error {}

export async function getReport(db: DB, id: string): Promise<Report | null> {
  const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return r ?? null;
}

export async function createDraftReport(db: DB, dateFrom: string, dateTo: string): Promise<Report> {
  if (dateFrom > dateTo) throw new ReportError("La fecha desde tiene que ser anterior a la fecha hasta.");
  const data = await buildReport(db, { dateFrom, dateTo });
  const mail = emailDraft(data);
  const [r] = await db.insert(reports).values({ dateFrom, dateTo, status: "borrador", emailSubject: mail.subject, emailBody: mail.body }).returning();
  await audit(db, "report.create", "reports", r.id);
  return r;
}

/** Cerrar rendición (RF-76): marca y bloquea todo lo incluido. No se puede con líneas sin tipo de cambio (§16.5). */
export async function closeReport(db: DB, id: string): Promise<Report> {
  const report = await getReport(db, id);
  if (!report) throw new ReportError("La rendición no existe.");
  if (report.status === "cerrado") throw new ReportError("La rendición ya está cerrada.");
  const data = await buildReport(db, { dateFrom: report.dateFrom, dateTo: report.dateTo, report });
  if (data.warnings.missingFxTotal > 0) throw new ReportError("Hay líneas sin tipo de cambio. Cargalo antes de cerrar.");
  if (data.trips.length === 0) throw new ReportError("La rendición no tiene gastos.");
  const txIds = data.trips.flatMap((t) => t.lines.map((l) => l.id));
  const kmIds = data.trips.flatMap((t) => t.mileage.map((m) => m.id));
  const tollIds = data.trips.flatMap((t) => t.tolls.map((p) => p.id));
  return db.transaction(async (tx) => {
    if (txIds.length) await tx.update(transactions).set({ reportId: id, updatedAt: new Date() }).where(and(inArray(transactions.id, txIds), isNull(transactions.reportId)));
    if (kmIds.length) await tx.update(tripMileage).set({ reportId: id }).where(and(inArray(tripMileage.id, kmIds), isNull(tripMileage.reportId)));
    if (tollIds.length) await tx.update(tripTolls).set({ reportId: id }).where(and(inArray(tripTolls.id, tollIds), isNull(tripTolls.reportId)));
    const [r] = await tx.update(reports).set({ status: "cerrado", closedAt: new Date(), totalEur: toDb(data.totalEur) }).where(eq(reports.id, id)).returning();
    await audit(tx, "report.close", "reports", id, { lines: txIds.length });
    return r;
  });
}

/** Reabrir (RF-76): desbloquea lo incluido. */
export async function reopenReport(db: DB, id: string): Promise<Report> {
  const report = await getReport(db, id);
  if (!report) throw new ReportError("La rendición no existe.");
  if (report.status !== "cerrado") throw new ReportError("La rendición no está cerrada.");
  return db.transaction(async (tx) => {
    await tx.update(transactions).set({ reportId: null, updatedAt: new Date() }).where(eq(transactions.reportId, id));
    await tx.update(tripMileage).set({ reportId: null }).where(eq(tripMileage.reportId, id));
    await tx.update(tripTolls).set({ reportId: null }).where(eq(tripTolls.reportId, id));
    const [r] = await tx.update(reports).set({ status: "borrador", closedAt: null, totalEur: null }).where(eq(reports.id, id)).returning();
    await audit(tx, "report.reopen", "reports", id);
    return r;
  });
}

export async function deleteDraftReport(db: DB, id: string) {
  const report = await getReport(db, id);
  if (!report || report.status === "cerrado") throw new ReportError("Solo se pueden borrar rendiciones en borrador.");
  await db.delete(reports).where(eq(reports.id, id));
}
