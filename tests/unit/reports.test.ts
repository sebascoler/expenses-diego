import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "@/lib/calc/money";
import type { DB } from "@/lib/db/client";
import { categories, transactions, tripMileage, tripTolls, trips, users } from "@/lib/db/schema";
import { importFile } from "@/lib/import/pipeline";
import { applyManualRate } from "@/lib/fx/manual";
import { buildReport } from "@/lib/reports/build";
import { closeReport, createDraftReport, reopenReport } from "@/lib/reports/lifecycle";
import { reportCsv } from "@/lib/reports/csv";
import { reportXlsx } from "@/lib/reports/xlsx";
import { reportPdf } from "@/lib/reports/pdf";
import { emailDraft } from "@/lib/reports/email-draft";
import type { ReportData } from "@/lib/reports/build";
import { validateSuggestions, type AiItem } from "@/lib/classify/ai";
import { classifyTransactions } from "@/lib/classify/pipeline";
import { setApplies } from "@/lib/tx/mutations";
import { tryBootstrap } from "@/lib/auth/bootstrap";
import { reminderDue, buildReminder } from "@/lib/mail/reminder";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { fixture, freshDb } from "../helpers/db";

const aiMock = vi.hoisted(() => ({ enabled: false, fn: vi.fn() }));
vi.mock("@/lib/classify/ai", async (orig) => {
  const mod = await orig<typeof import("@/lib/classify/ai")>();
  return { ...mod, isAiEnabled: () => aiMock.enabled, classifyWithAi: aiMock.fn };
});

let db: DB;
beforeEach(async () => {
  db = await freshDb();
  aiMock.enabled = false;
  aiMock.fn.mockReset();
  aiMock.fn.mockResolvedValue(new Map());
});

describe("rendición", () => {
  it("cuadra con la preview, se cierra, bloquea y se puede reabrir", async () => {
    await importFile(db, { buffer: fixture("bbva-sample.xlsx"), fileName: "b.xlsx" });
    const [trip] = await db.insert(trips).values({ name: "Montevideo", dateFrom: "2026-10-15", dateTo: "2026-10-24" }).returning();
    await classifyTransactions(db);
    const all = await db.select().from(transactions).where(eq(transactions.kind, "gasto"));
    await setApplies(db, all.map((t) => t.id), true, { manual: false });
    await db.insert(tripMileage).values({ tripId: trip.id, kmTotal: "1250", kmDeduction: "200", rateEur: "0.35" });
    await db.insert(tripTolls).values({ tripId: trip.id, amount: "455", currency: "UYU", fxRate: null });

    let preview = await buildReport(db, { dateFrom: "2026-08-01", dateTo: "2026-10-31" });
    expect(preview.warnings.missingFx.find((m) => m.currency === "UYU")).toBeTruthy();
    const r = await createDraftReport(db, "2026-08-01", "2026-10-31");
    await expect(closeReport(db, r.id)).rejects.toThrow(/tipo de cambio/);
    await applyManualRate(db, "UYU", "45.5");
    preview = await buildReport(db, { dateFrom: "2026-08-01", dateTo: "2026-10-31" });
    expect(preview.warnings.missingFxTotal).toBe(0);
    const mvd = preview.trips.find((t) => t.name === "Montevideo")!;
    expect(mvd.totals.mileageEur.toFixed(2)).toBe("367.50");
    expect(mvd.totals.tollsEur.toFixed(2)).toBe("10.00");

    const closed = await closeReport(db, r.id);
    expect(closed.status).toBe("cerrado");
    expect(closed.totalEur).toBe(Number(preview.totalEur).toFixed(4));
    const frozen = await buildReport(db, { dateFrom: r.dateFrom, dateTo: r.dateTo, report: closed });
    expect(frozen.totalEur.toFixed(2)).toBe(preview.totalEur.toFixed(2));
    // lo rendido no se puede volver a rendir
    const again = await buildReport(db, { dateFrom: "2026-08-01", dateTo: "2026-10-31" });
    expect(again.totalEur.toFixed(2)).toBe("0.00");
    // lo rendido no se edita
    await setApplies(db, [all[0].id], false);
    expect((await db.select().from(transactions).where(eq(transactions.id, all[0].id)))[0].applies).toBe(true);

    // entregables
    const csv = reportCsv(frozen);
    expect(csv.split("\r\n").length).toBeGreaterThan(30);
    const pdf = await reportPdf(frozen);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const xlsx = await reportXlsx(frozen);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    const mail = emailDraft(frozen);
    expect(mail.subject).toContain("01/08/2026 al 31/10/2026");
    expect(mail.body).toContain("Montevideo");

    await reopenReport(db, r.id);
    expect((await buildReport(db, { dateFrom: "2026-08-01", dateTo: "2026-10-31" })).totalEur.toFixed(2)).toBe(preview.totalEur.toFixed(2));
  });

  it("un CSV exportado con =SUM(1) en una descripción sale sanitizado", () => {
    const line = { id: "1", date: "2026-10-01", merchant: "=SUM(1)", description: null, category: "Otros", source: "manual", currency: "EUR", amount: new Decimal(1), surcharge: new Decimal(0), fee: new Decimal(0), totalOriginal: new Decimal(1), fxRate: "1", fxSource: "eur", eur: new Decimal(1), note: "@cmd", bankStatus: null };
    const data = { trips: [{ name: "=HYPERLINK(1)", lines: [line], mileage: [], tolls: [] }] } as unknown as ReportData;
    const csv = reportCsv(data);
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'@cmd");
    expect(csv).not.toMatch(/(^|;)=SUM/m);
  });
});

describe("IA (§16.7)", () => {
  const batch: AiItem[] = [
    { id: 0, fecha: "2026-10-05", comercio: "HOTEL X", monto: "100", moneda: "EUR", fuente: "wise", tipo_tarjeta: null, viaje_candidato: null },
    { id: 1, fecha: "2026-10-05", comercio: "NETFLIX", monto: "10", moneda: "EUR", fuente: "wise", tipo_tarjeta: null, viaje_candidato: null },
  ];
  it("valida con Zod e ignora ítems inválidos o categorías inventadas", () => {
    const out = validateSuggestions(
      { items: [{ id: 0, applies: true, category: "Alojamiento", confidence: "alta", reason: "Hotel en viaje" }, { id: 1, applies: "si", category: null, confidence: "alta", reason: "x" }, { id: 9, applies: true, category: null, confidence: "alta", reason: "x" }, { id: 0, applies: false, category: "Inventada", confidence: "baja", reason: "y".repeat(200) }] },
      batch,
      ["Alojamiento"],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 0, applies: true, category: "Alojamiento" });
    expect(out[1].category).toBeNull();
    expect(out[1].reason.length).toBe(80);
  });

  it("recibe solo datos minimizados y nunca toca filas decididas por Diego", async () => {
    aiMock.enabled = true;
    aiMock.fn.mockImplementation(async (items: AiItem[]) => new Map(items.map((i) => [i.id, { id: i.id, applies: true, category: null, confidence: "media" as const, reason: "IA" }])));
    await importFile(db, { buffer: fixture("wise-sample.csv"), fileName: "w.csv" });
    const sent: AiItem[] = aiMock.fn.mock.calls[0][0];
    expect(sent.length).toBe(48);
    for (const it of sent) {
      expect(Object.keys(it).sort()).toEqual(["comercio", "fecha", "fuente", "id", "moneda", "monto", "tipo_tarjeta", "viaje_candidato"]);
      expect(JSON.stringify(it)).not.toMatch(/Titular Ficticio|XX00|CARD-/);
    }
    const [one] = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "ZARA"));
    expect(one.suggestionSource).toBe("ia");
    await setApplies(db, [one.id], false);
    aiMock.fn.mockClear();
    await classifyTransactions(db);
    const ids = (aiMock.fn.mock.calls[0][0] as AiItem[]).map((i) => i.comercio);
    expect(ids).not.toContain("ZARA");
  });

  it("sin IA todo queda sin clasificar y funciona igual (RF-34)", async () => {
    const out = await importFile(db, { buffer: fixture("wise-sample.csv"), fileName: "w.csv" });
    expect(out.status).toBe("done");
    const rows = await db.select().from(transactions).where(eq(transactions.kind, "gasto"));
    expect(rows.every((r) => r.applies === null)).toBe(true);
    expect(rows.filter((r) => r.categoryId).length).toBeGreaterThan(10); // pistas deterministas de categoría
  });

  it("aprendizaje: a la segunda corrección del mismo comercio se ofrece una regla (RF-35)", async () => {
    await importFile(db, { buffer: fixture("wise-sample.csv"), fileName: "w.csv" });
    const netflix = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "NETFLIX"));
    expect(await setApplies(db, [netflix[0].id], false)).toEqual([]);
    expect(await setApplies(db, [netflix[1].id], false)).toEqual([{ merchant: "NETFLIX", applies: false }]);
  });

  it("la regla de tarjeta usa los últimos 4 configurados (RF-31)", async () => {
    const { updateSettings } = await import("@/lib/settings");
    await updateSettings({ bbvaCards: [{ last4: "2222", type: "virtual" }, { last4: "1111", type: "fisica" }] }, db);
    await importFile(db, { buffer: fixture("bbva-sample.xlsx"), fileName: "b.xlsx" });
    const rows = await db.select().from(transactions).where(eq(transactions.kind, "gasto"));
    const v = rows.find((r) => r.cardLast4 === "2222")!;
    const f = rows.find((r) => r.cardLast4 === "1111")!;
    expect(v).toMatchObject({ suggestedApplies: true, suggestionSource: "tarjeta", suggestionConfidence: "media" });
    expect(f).toMatchObject({ suggestedApplies: false, suggestionSource: "tarjeta" });
  });
});

describe("bootstrap (§16.9) y recordatorio (RF-80 a RF-83)", () => {
  it("el bootstrap crea el usuario solo si la tabla está vacía", async () => {
    process.env.BOOTSTRAP_USERNAME = "Diego";
    process.env.BOOTSTRAP_PASSWORD = "clave-bootstrap-12";
    expect(await tryBootstrap(db, "diego", "otra")).toBeNull();
    expect(await tryBootstrap(db, "diego", "clave-bootstrap-12")).toMatchObject({ username: "diego" });
    expect(await tryBootstrap(db, "diego", "clave-bootstrap-12")).toBeNull();
    expect(await db.select().from(users)).toHaveLength(1);
    delete process.env.BOOTSTRAP_USERNAME;
    delete process.env.BOOTSTRAP_PASSWORD;
  });

  it("el bootstrap tolera espacios, saltos de línea y comillas pegados en las variables", async () => {
    process.env.BOOTSTRAP_USERNAME = ' "Sebastian" ';
    process.env.BOOTSTRAP_PASSWORD = "clave-bootstrap-12 \n";
    expect(await tryBootstrap(db, "sebastian", "clave-bootstrap-12")).toMatchObject({ username: "sebastian" });
    delete process.env.BOOTSTRAP_USERNAME;
    delete process.env.BOOTSTRAP_PASSWORD;
  });

  it("decide el día del recordatorio y el segundo aviso", async () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(await reminderDue(db, s, new Date("2026-11-19T12:00:00Z"))).toBeNull();
    expect(await reminderDue(db, s, new Date("2026-11-20T12:00:00Z"))).toBe("first");
    expect(await reminderDue(db, s, new Date("2026-11-20T10:00:00Z"))).toBeNull(); // 07:00 en Buenos Aires
    const sent = { ...s, lastReminderSentOn: "2026-11-20" };
    expect(await reminderDue(db, sent, new Date("2026-11-21T12:00:00Z"))).toBeNull();
    expect(await reminderDue(db, sent, new Date("2026-11-23T12:00:00Z"))).toBe("second");
    expect(await reminderDue(db, { ...sent, reminderSecondNotice: false }, new Date("2026-11-23T12:00:00Z"))).toBeNull();
    expect(await reminderDue(db, { ...sent, lastSecondReminderSentOn: "2026-11-23" }, new Date("2026-11-24T12:00:00Z"))).toBeNull();
  });

  it("el mail solo lleva cantidades y totales", async () => {
    await importFile(db, { buffer: fixture("bbva-sample.xlsx"), fileName: "b.xlsx" });
    const m = await buildReminder(db, "first");
    expect(m.text).toContain("Último movimiento cargado");
    expect(m.text).toContain("BBVA: 31/10");
    expect(m.text).toContain("Bajá el Excel de BBVA desde el 24/10/2026 hasta hoy");
    expect(m.text).not.toMatch(/ANTEL|UBER|HOTEL|COPA/);
    expect((await db.select().from(categories)).length).toBe(10);
  });
});

describe("ajustes", () => {
  it("actualizar una clave no pisa las demás", async () => {
    const { getSettings, updateSettings } = await import("@/lib/settings");
    await updateSettings({ kmRateEur: "0.40" }, db);
    await updateSettings({ reportName: "Otro Nombre", lastReminderSentOn: null }, db);
    const s = await getSettings(db);
    expect(s.kmRateEur).toBe("0.40");
    expect(s.reportName).toBe("Otro Nombre");
    expect(s.lastReminderSentOn).toBeNull();
  });
});
