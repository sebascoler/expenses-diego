"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { applyManualRate } from "@/lib/fx/manual";
import { parseAmount } from "@/lib/parsers/amount";
import { closeReport, createDraftReport, deleteDraftReport, reopenReport, ReportError } from "@/lib/reports/lifecycle";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function createReportAction(_prev: { error?: string } | undefined, fd: FormData) {
  await requireSession();
  const p = z.object({ dateFrom: isoDate, dateTo: isoDate }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Elegí un rango de fechas válido." };
  let id: string;
  try {
    id = (await createDraftReport(await getDb(), p.data.dateFrom, p.data.dateTo)).id;
  } catch (e) {
    return { error: e instanceof ReportError ? e.message : "No se pudo crear la rendición." };
  }
  redirect(`/rendiciones/${id}`);
}

export async function closeReportAction(id: string) {
  await requireSession();
  try {
    await closeReport(await getDb(), z.string().uuid().parse(id));
  } catch (e) {
    return { error: e instanceof ReportError ? e.message : "No se pudo cerrar la rendición." };
  }
  revalidatePath(`/rendiciones/${id}`);
  return { ok: true };
}

export async function reopenReportAction(id: string) {
  await requireSession();
  try {
    await reopenReport(await getDb(), z.string().uuid().parse(id));
  } catch (e) {
    return { error: e instanceof ReportError ? e.message : "No se pudo reabrir la rendición." };
  }
  revalidatePath(`/rendiciones/${id}`);
  return { ok: true };
}

export async function deleteDraftAction(id: string) {
  await requireSession();
  try {
    await deleteDraftReport(await getDb(), z.string().uuid().parse(id));
  } catch (e) {
    return { error: e instanceof ReportError ? e.message : "No se pudo borrar." };
  }
  redirect("/rendiciones");
}

export async function saveEmailAction(input: { id: string; subject: string; body: string }) {
  await requireSession();
  const p = z.object({ id: z.string().uuid(), subject: z.string().max(300), body: z.string().max(10000) }).parse(input);
  await (await getDb()).update(reports).set({ emailSubject: p.subject, emailBody: p.body }).where(eq(reports.id, p.id));
  return { ok: true };
}

export async function manualFxAction(_prev: { error?: string; ok?: string } | undefined, fd: FormData) {
  await requireSession();
  const p = z
    .object({ currency: z.string().regex(/^[A-Z]{3}$/), units: z.string().min(1).max(30), reportId: z.string().uuid().optional() })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Tipo de cambio inválido." };
  const units = parseAmount(p.data.units);
  if (!units || !units.isPositive()) return { error: "Escribí cuántas unidades equivalen a 1 EUR (por ejemplo 45,5)." };
  const n = await applyManualRate(await getDb(), p.data.currency, units.toString());
  revalidatePath("/rendiciones");
  if (p.data.reportId) revalidatePath(`/rendiciones/${p.data.reportId}`);
  return { ok: `Tipo de cambio aplicado a ${n} líneas en ${p.data.currency}.` };
}
