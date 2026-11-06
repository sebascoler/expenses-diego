import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importFile } from "@/lib/import/pipeline";
import { transactions, importProfiles, reports } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import type { ColumnMapping } from "@/lib/parsers/types";
import { fixture, freshDb } from "../helpers/db";

vi.mock("@/lib/classify/ai", async (orig) => {
  const mod = await orig<typeof import("@/lib/classify/ai")>();
  return { ...mod, isAiEnabled: () => false, classifyWithAi: vi.fn(async () => new Map()) };
});

let db: DB;
beforeEach(async () => {
  db = await freshDb();
});

async function run(name: string, mapping?: ColumnMapping) {
  const out = await importFile(db, { buffer: fixture(name), fileName: name, mapping });
  if (out.status !== "done") throw new Error(`esperaba done, vino ${out.status}`);
  return out.summary;
}

describe("pipeline de importación", () => {
  it("Wise: importa 48 gastos y 9 no-gastos, con EUR calculado", async () => {
    const s = await run("wise-sample.csv");
    expect(s.source).toBe("wise");
    expect(s.rowsRead).toBe(57);
    expect(s.rowsNew).toBe(48);
    expect(s.rowsIgnored).toBe(9);
    expect(s.rowsDup).toBe(0);
    const [hotel] = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "HOTEL MIRAFLORES FICTICIO"));
    expect(hotel.fxSource).toBe("wise");
    // 597,56 + fee 2,69 = 600,25
    expect(hotel.amountEur).toBe("600.2500");
    expect(hotel.descriptionEnc).not.toContain("Miraflores");
  });

  it("re-subir el mismo archivo no lo reprocesa (RF-14)", async () => {
    await run("wise-sample.csv");
    const again = await importFile(db, { buffer: fixture("wise-sample.csv"), fileName: "otra-vez.csv" });
    expect(again.status).toBe("duplicate_file");
  });

  it("re-importar el mismo contenido da 0 nuevas", async () => {
    await run("wise-sample.csv");
    const buf = Buffer.concat([fixture("wise-sample.csv"), Buffer.from("\n")]);
    const out = await importFile(db, { buffer: buf, fileName: "wise-2.csv" });
    expect(out.status).toBe("done");
    if (out.status === "done") {
      expect(out.summary.rowsNew).toBe(0);
      expect(out.summary.rowsIgnored).toBe(0);
      expect(out.summary.rowsDup).toBe(57);
    }
  });

  it("BBVA: 39 gastos, 2 no-gastos, USD por BCE y UYU pendiente de tipo de cambio", async () => {
    const s = await run("bbva-sample.xlsx");
    expect(s.rowsNew).toBe(39);
    expect(s.rowsIgnored).toBe(2);
    const rows = await db.select().from(transactions);
    const usd = rows.find((r) => r.currency === "USD" && r.kind === "gasto")!;
    expect(usd.fxSource).toBe("ecb");
    expect(usd.surchargeEnabled).toBe(true);
    const uyu = rows.find((r) => r.currency === "UYU")!;
    expect(uyu.fxSource).toBe("pendiente");
  });

  it("bbva-overlap: 10 duplicados y 3 reconciliados, conservando la clasificación", async () => {
    await run("bbva-sample.xlsx");
    const [copa] = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "COPA AIRLINES"));
    expect(copa.bankStatus).toBe("pendiente");
    await db.update(transactions).set({ applies: true, noteEnc: "nota" }).where(eq(transactions.id, copa.id));
    const s = await run("bbva-overlap.xlsx");
    expect(s.rowsDup).toBe(10);
    expect(s.rowsReconciled).toBe(3);
    expect(s.rowsNew).toBe(7);
    expect(s.rowsIgnored).toBe(1);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, copa.id));
    expect(after.bankStatus).toBe("consolidado");
    expect(after.applies).toBe(true);
    expect(after.noteEnc).toBe("nota");
    expect(after.amount).toBe("-416.9300");
    // re-importar el archivo viejo no vuelve a crear el pendiente
    const again = await importFile(db, { buffer: Buffer.concat([fixture("bbva-sample.xlsx")]), fileName: "x.xlsx" });
    expect(again.status).toBe("duplicate_file");
  });

  it("las transacciones rendidas no se modifican al re-importar (RF-29)", async () => {
    await run("bbva-sample.xlsx");
    const [rep] = await db.insert(reports).values({ dateFrom: "2026-08-01", dateTo: "2026-10-31", status: "cerrado" }).returning();
    const [copa] = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "COPA AIRLINES"));
    await db.update(transactions).set({ applies: true, reportId: rep.id }).where(eq(transactions.id, copa.id));
    const s = await run("bbva-overlap.xlsx");
    expect(s.rowsReconciled).toBe(2);
    expect(s.rowsDup).toBe(11);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, copa.id));
    expect(after.bankStatus).toBe("pendiente");
    expect(after.amount).toBe(copa.amount);
    const copas = await db.select().from(transactions).where(eq(transactions.merchantNormalized, "COPA AIRLINES"));
    expect(copas).toHaveLength(1);
  });

  it("archivo desconocido pide mapeo, y el perfil guardado se aplica en la segunda importación (RF-16)", async () => {
    const first = await importFile(db, { buffer: fixture("bbva-unknown.xlsx"), fileName: "u.xlsx" });
    expect(first.status).toBe("needs_mapping");
    if (first.status !== "needs_mapping") return;
    expect(first.headers).toEqual(["F. Operación", "Concepto", "Débito", "Crédito", "Div."]);
    expect(first.sample).toHaveLength(5);
    const mapping: ColumnMapping = { source: "bbva", date: "F. Operación", description: "Concepto", debit: "Débito", credit: "Crédito", currency: "Div." };
    const s = await run("bbva-unknown.xlsx", mapping);
    expect(s.rowsNew).toBe(39);
    expect(s.rowsIgnored).toBe(2);
    expect(await db.select().from(importProfiles)).toHaveLength(1);
    // Un archivo distinto con los mismos encabezados usa el perfil automáticamente
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["F. Operación", "Concepto", "Débito", "Crédito", "Div."],
      ["01/11/2026", "KIOSCO FICTICIO", 120, null, "$U"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "H");
    const out = await importFile(db, { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), fileName: "otro.xlsx" });
    expect(out.status).toBe("done");
    if (out.status === "done") {
      expect(out.summary.usedProfile).toBe(true);
      expect(out.summary.rowsNew).toBe(1);
    }
  });
});
