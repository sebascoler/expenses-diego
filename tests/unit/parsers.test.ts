import { describe, expect, it } from "vitest";
import { parseAmount } from "@/lib/parsers/amount";
import { parseDate } from "@/lib/parsers/date";
import { detectSource, findHeaderRow, headerList } from "@/lib/parsers/detect";
import { normalizeMerchant } from "@/lib/parsers/merchant";
import { parseBbva } from "@/lib/parsers/bbva";
import { parseWise } from "@/lib/parsers/wise";
import { detectFileKind, readTable, FileValidationError } from "@/lib/parsers/table";
import { fixture } from "../helpers/db";

describe("parseAmount (RF-17)", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["(12,50)", "-12.5"],
    ["-12.50", "-12.5"],
    ["12,50-", "-12.5"],
    ["€ 1.234,00", "1234"],
    ["US$ -45.10", "-45.1"],
    ["1.234.567", "1234567"],
    ["0,99", "0.99"],
    [42.5, "42.5"],
  ])("%s → %s", (input, expected) => {
    expect(parseAmount(input)?.toString()).toBe(expected);
  });
  it("devuelve null si no es un monto", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe("parseDate (RF-17)", () => {
  it.each([
    ["03/10/2026", "2026-10-03"],
    ["3/10/26", "2026-10-03"],
    ["03-10-2026", "2026-10-03"],
    ["2026-10-03", "2026-10-03"],
    ["2026-10-03 14:22:11", "2026-10-03"],
    ["03/10/2026 09:15", "2026-10-03"],
    [46298, "2026-10-03"],
    ["46298", "2026-10-03"],
  ])("%s → %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
  it("rechaza fechas inválidas", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Total")).toBeNull();
  });
});

describe("normalizeMerchant", () => {
  it("quita prefijos, referencias y acentos", () => {
    expect(normalizeMerchant("Card transaction of 12.00 EUR issued by Uber Madrid")).toBe("UBER MADRID");
    expect(normalizeMerchant("UBER *TRIP 123456")).toBe("UBER TRIP");
    expect(normalizeMerchant("Cafetería Estación")).toBe("CAFETERIA ESTACION");
  });
});

describe("detección de archivo, fuente y encabezados (RF-11, RF-12)", () => {
  it("valida el contenido real y no solo la extensión", () => {
    expect(() => detectFileKind(Buffer.from("hola,mundo"), "x.xlsx")).toThrow(FileValidationError);
    expect(() => detectFileKind(fixture("bbva-sample.xlsx"), "x.csv")).toThrow(FileValidationError);
    expect(() => detectFileKind(Buffer.from("a"), "x.pdf")).toThrow(FileValidationError);
    expect(detectFileKind(fixture("wise-sample.csv"), "wise.csv")).toBe("csv");
  });
  it("detecta Wise y BBVA, y encuentra la fila de encabezados debajo del título", () => {
    const w = readTable(fixture("wise-sample.csv"), "wise.csv");
    expect(findHeaderRow(w.rows)).toBe(0);
    expect(detectSource(headerList(w.rows[0]))).toBe("wise");
    const b = readTable(fixture("bbva-sample.xlsx"), "bbva.xlsx");
    const h = findHeaderRow(b.rows);
    expect(h).toBe(2);
    expect(detectSource(headerList(b.rows[h]))).toBe("bbva");
    const u = readTable(fixture("bbva-unknown.xlsx"), "u.xlsx");
    const hu = findHeaderRow(u.rows);
    expect(hu).toBe(1);
    expect(detectSource(headerList(u.rows[hu]))).toBeNull();
  });
});

describe("parsers de fixtures", () => {
  it("Wise: 48 gastos y 9 no-gastos, con conversión y fee separados", () => {
    const t = readTable(fixture("wise-sample.csv"), "wise.csv");
    const r = parseWise(t.rows, 0);
    expect(r.errors).toEqual([]);
    expect(r.rows.filter((x) => x.kind === "gasto")).toHaveLength(48);
    expect(r.rows.filter((x) => x.kind === "no_gasto")).toHaveLength(9);
    const hotel = r.rows.find((x) => x.merchant === "HOTEL MIRAFLORES FICTICIO")!;
    expect(hotel.currency).toBe("PEN");
    expect(hotel.amount.toString()).toBe("-2450");
    expect(hotel.accountCurrency).toBe("EUR");
    expect(hotel.feeAmount?.toString()).toBe("2.69");
    expect(hotel.accountAmount?.toString()).toBe("-597.56");
  });
  it("BBVA: ignora título y totales, detecta pendientes y tarjeta", () => {
    const t = readTable(fixture("bbva-sample.xlsx"), "bbva.xlsx");
    const r = parseBbva(t.rows, findHeaderRow(t.rows));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(41);
    expect(r.rows.filter((x) => x.kind === "no_gasto")).toHaveLength(2);
    expect(r.rows.filter((x) => x.bankStatus === "pendiente")).toHaveLength(5);
    expect(new Set(r.rows.map((x) => x.cardLast4))).toEqual(new Set(["1111", "2222"]));
  });
});
