/**
 * Genera los fixtures sintéticos de §16.6 de forma determinista (seed fija).
 * Todos los comercios, nombres y números son FICTICIOS. Nunca se commitean datos reales.
 *
 *   pnpm fixtures:generate
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const OUT = path.join(process.cwd(), "fixtures");

// PRNG determinista (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261114);
const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;

const HOLDER = "Titular Ficticio";

// ───────────────────────────── Wise ─────────────────────────────
const WISE_HEADERS = [
  "TransferWise ID",
  "Date",
  "Amount",
  "Currency",
  "Description",
  "Payment Reference",
  "Running Balance",
  "Exchange From",
  "Exchange To",
  "Exchange Rate",
  "Payer Name",
  "Payee Name",
  "Payee Account Number",
  "Merchant",
  "Card Last Four Digits",
  "Card Holder Full Name",
  "Attachment",
  "Note",
  "Total fees",
  "Exchange To Amount",
] as const;

type WiseRow = Partial<Record<(typeof WISE_HEADERS)[number], string | number>>;

const PEN_PER_EUR = 4.1;
const UYU_PER_EUR = 45.5;

let wiseSeq = 100000;
const wiseRows: { date: string; row: WiseRow }[] = [];

function wiseDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function card(iso: string, merchant: string, amount: number, currency = "EUR") {
  wiseRows.push({
    date: iso,
    row: {
      "TransferWise ID": `CARD-${wiseSeq++}`,
      Date: wiseDate(iso),
      Amount: (-amount).toFixed(2),
      Currency: currency,
      Description: `Card transaction of ${amount.toFixed(2)} ${currency} issued by ${merchant}`,
      Merchant: merchant,
      "Card Last Four Digits": "4321",
      "Card Holder Full Name": HOLDER,
      "Total fees": "0.00",
    },
  });
}

/** Pago con tarjeta en moneda extranjera, convertido desde el balance EUR con fee. */
function cardFx(iso: string, merchant: string, foreignAmount: number, foreign: "PEN" | "UYU") {
  const rate = foreign === "PEN" ? PEN_PER_EUR : UYU_PER_EUR;
  const eur = r2(foreignAmount / rate);
  const fee = r2(Math.max(0.35, eur * 0.0045));
  wiseRows.push({
    date: iso,
    row: {
      "TransferWise ID": `CARD-${wiseSeq++}`,
      Date: wiseDate(iso),
      Amount: (-(eur + fee)).toFixed(2),
      Currency: "EUR",
      Description: `Card transaction of ${foreignAmount.toFixed(2)} ${foreign} issued by ${merchant}`,
      "Exchange From": "EUR",
      "Exchange To": foreign,
      "Exchange Rate": rate.toFixed(4),
      Merchant: merchant,
      "Card Last Four Digits": "4321",
      "Card Holder Full Name": HOLDER,
      "Total fees": fee.toFixed(2),
      "Exchange To Amount": foreignAmount.toFixed(2),
    },
  });
}

function wiseOther(iso: string, id: string, amount: number, currency: string, description: string, extra: WiseRow = {}) {
  wiseRows.push({
    date: iso,
    row: { "TransferWise ID": id, Date: wiseDate(iso), Amount: amount.toFixed(2), Currency: currency, Description: description, ...extra },
  });
}

// No gastos (RF-21)
wiseOther("2026-08-01", "BALANCE_DEPOSIT-5001", 2000, "EUR", "Topped up balance");
wiseOther("2026-10-01", "BALANCE_DEPOSIT-5002", 1500, "EUR", "Topped up balance");
wiseOther("2026-09-05", "CONVERSION-6001", -100, "EUR", "Converted 100.00 EUR to 410.00 PEN");
wiseOther("2026-09-05", "CONVERSION-6001", 410, "PEN", "Converted 100.00 EUR to 410.00 PEN");
wiseOther("2026-10-19", "CONVERSION-6002", -50, "EUR", "Converted 50.00 EUR to 2275.00 UYU");
wiseOther("2026-10-19", "CONVERSION-6002", 2275, "UYU", "Converted 50.00 EUR to 2275.00 UYU");
wiseOther("2026-08-28", "TRANSFER-7001", -500, "EUR", `Sent money to ${HOLDER}`, {
  "Payer Name": HOLDER,
  "Payee Name": HOLDER,
  "Payee Account Number": "XX00 TEST 0000 0000",
  "Payment Reference": "Ahorro",
});
wiseOther("2026-09-30", "BALANCE_CASHBACK-8001", 3.21, "EUR", "Balance cashback");
wiseOther("2026-10-31", "INTEREST-8002", 1.05, "EUR", "Interest earned");

// Personales evidentes: streaming y supermercado
for (const m of ["08", "09", "10", "11"]) card(`2026-${m}-05`, "Netflix", 13.99);
for (const m of ["08", "09", "10"]) card(`2026-${m}-12`, "Spotify", 10.99);
for (const iso of ["2026-08-09", "2026-08-23", "2026-09-06", "2026-09-27", "2026-10-25", "2026-11-08"])
  card(iso, iso.endsWith("9") ? "Carrefour Market" : "Mercadona", between(35, 120));

// Pasajes y oficina (fuera de viaje → Gastos generales)
card("2026-08-25", "Iberia Lineas Aereas", 742.3);
card("2026-09-22", "Vueling Airlines", 1180.4); // 8 pasajes para el equipo (escenario 4)
card("2026-10-28", "Amazon Business", 89.9);
for (const m of ["08", "09", "10"]) card(`2026-${m}-15`, "Movistar Empresas", 39.9);

// Viaje Lima (10/09–18/09): PEN con conversión y fee, más 2 pagos desde el balance PEN
cardFx("2026-09-10", "Uber Trip Lima", 38.5, "PEN");
cardFx("2026-09-10", "Hotel Miraflores Ficticio", 2450, "PEN");
cardFx("2026-09-11", "Restaurante La Costa Ficticia", 145, "PEN");
cardFx("2026-09-12", "Uber Trip Lima", 27.8, "PEN");
cardFx("2026-09-13", "Primax Combustible", 180, "PEN");
cardFx("2026-09-14", "Cevicheria El Puerto Ficticio", 98, "PEN");
cardFx("2026-09-15", "Taxi Seguro Lima", 45, "PEN");
cardFx("2026-09-16", "Uber Trip Lima", 31.2, "PEN");
cardFx("2026-09-17", "Restaurante Andino Ficticio", 210, "PEN");
card("2026-09-14", "Farmacia Inkafarma Ficticia", 64.5, "PEN");
card("2026-09-18", "Uber Trip Lima", 52, "PEN");

// Viaje España (03/10–12/10): fin de semana personal (auto y nafta) y semana de trabajo
card("2026-10-03", "Europcar Madrid", 185.0);
card("2026-10-04", "Repsol Estacion", 62.4);
card("2026-10-05", "Hotel Gran Via Ficticio", 412.0);
card("2026-10-06", "Repsol Estacion", 71.15);
card("2026-10-06", "Restaurante Casa Ficticia", 48.6);
card("2026-10-07", "Uber Trip Madrid", 18.4);
card("2026-10-08", "Restaurante El Mercado Ficticio", 55.2);
card("2026-10-09", "Repsol Estacion", 58.9);
card("2026-10-10", "Hotel Puerta Ficticia Barcelona", 298.0);
card("2026-10-11", "Uber Trip Barcelona", 22.7);
card("2026-10-12", "Cafeteria Estacion Sants", 12.3);

// Montevideo (20/10–23/10): UYU con conversión y fee
cardFx("2026-10-20", "Uber Trip Montevideo", 420, "UYU");
cardFx("2026-10-21", "Parrilla Rambla Ficticia", 1850, "UYU");
cardFx("2026-10-21", "Hotel Pocitos Ficticio", 6900, "UYU");
cardFx("2026-10-22", "Uber Trip Montevideo", 365, "UYU");

// Noviembre
card("2026-11-02", "Cabify", 16.8);
card("2026-11-03", "Restaurante Casa Ficticia", 33.4);
card("2026-11-04", "Zara", 79.95);

wiseRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // Wise exporta del más nuevo al más viejo

function csvEscape(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const wiseCsv = [WISE_HEADERS.join(","), ...wiseRows.map(({ row }) => WISE_HEADERS.map((h) => csvEscape(row[h])).join(","))].join("\n") + "\n";
writeFileSync(path.join(OUT, "wise-sample.csv"), wiseCsv);

// ───────────────────────────── BBVA ─────────────────────────────
type BbvaRow = { date: string; desc: string; card: "1111" | "2222"; currency: "USD" | "UYU"; amount: number; status: "Pendiente" | "Consolidado" };
const bbva: BbvaRow[] = [];
const add = (date: string, desc: string, cardNo: "1111" | "2222", currency: "USD" | "UYU", amount: number, status: BbvaRow["status"] = "Consolidado") =>
  bbva.push({ date, desc, card: cardNo, currency, amount, status });

// Agosto
add("2026-08-02", "PANADERIA LA ESPIGA FICTICIA", "1111", "UYU", -540);
add("2026-08-04", "ANTEL TELEFONIA", "2222", "UYU", -1890);
add("2026-08-06", "UBER *TRIP", "2222", "USD", -12.4);
add("2026-08-08", "SUPERMERCADO DISCO FICTICIO", "1111", "UYU", -3120);
add("2026-08-11", "AEROLINEAS ARGENTINAS", "2222", "USD", -312.5);
add("2026-08-13", "DISNEY PLUS", "1111", "USD", -10.99);
add("2026-08-17", "ANCAP ESTACION", "2222", "UYU", -2650);
add("2026-08-19", "RESTAURANTE EL FOGON FICTICIO", "1111", "UYU", -1780);
add("2026-08-22", "BUQUEBUS PASAJES", "2222", "USD", -145);
add("2026-08-26", "PAGO DE TARJETA", "1111", "USD", 900);
add("2026-08-28", "PEAJE RUTA 1 FICTICIO", "2222", "UYU", -180);
// Septiembre
add("2026-09-02", "ANTEL TELEFONIA", "2222", "UYU", -1890);
add("2026-09-04", "UBER *TRIP", "2222", "USD", -9.8);
add("2026-09-07", "SUPERMERCADO DISCO FICTICIO", "1111", "UYU", -2875);
add("2026-09-09", "LATAM AIRLINES", "2222", "USD", -486.2);
add("2026-09-12", "HOTEL COUNTRY LIMA FICTICIO", "2222", "USD", -268);
add("2026-09-13", "DISNEY PLUS", "1111", "USD", -10.99);
add("2026-09-15", "RESTAURANTE MAR ADENTRO FICTICIO", "2222", "USD", -74.3);
add("2026-09-21", "ANCAP ESTACION", "2222", "UYU", -2410);
add("2026-09-24", "FARMACIA SAN ROQUE FICTICIA", "1111", "UYU", -960);
add("2026-09-26", "PAGO DE TARJETA", "1111", "USD", 1200);
// Octubre
add("2026-10-01", "ANTEL TELEFONIA", "2222", "UYU", -1890);
add("2026-10-02", "IBERIA LINEAS AEREAS", "2222", "USD", -654);
add("2026-10-05", "HERTZ ESPANA", "2222", "USD", -96.4);
add("2026-10-09", "PARKING AEROPUERTO FICTICIO", "2222", "USD", -38);
add("2026-10-13", "DISNEY PLUS", "1111", "USD", -10.99);
// 15/10–24/10: se repiten en bbva-overlap (10 duplicados)
add("2026-10-15", "UBER *TRIP", "2222", "USD", -11.2);
add("2026-10-16", "SUPERMERCADO DISCO FICTICIO", "1111", "UYU", -2990);
add("2026-10-17", "ANCAP ESTACION", "2222", "UYU", -2580);
add("2026-10-18", "RESTAURANTE EL FOGON FICTICIO", "1111", "UYU", -2140);
add("2026-10-19", "BUQUEBUS PASAJES", "2222", "USD", -152);
add("2026-10-20", "HOTEL RAMBLA FICTICIO", "2222", "USD", -389);
add("2026-10-21", "RESTAURANTE LA PROA FICTICIO", "2222", "UYU", -2380);
add("2026-10-22", "TAXI AEROPUERTO CARRASCO", "2222", "UYU", -1450);
add("2026-10-23", "PANADERIA LA ESPIGA FICTICIA", "1111", "UYU", -620);
add("2026-10-24", "PEAJE RUTA 1 FICTICIO", "2222", "UYU", -180);
// 26/10–31/10: pendientes (3 se consolidan en bbva-overlap)
add("2026-10-26", "COPA AIRLINES", "2222", "USD", -412.8, "Pendiente");
add("2026-10-27", "RESTAURANTE PUNTA FICTICIO", "2222", "UYU", -1960, "Pendiente");
add("2026-10-29", "ANCAP ESTACION NORTE", "2222", "UYU", -2730, "Pendiente");
add("2026-10-30", "UBER *TRIP", "2222", "USD", -14.6, "Pendiente");
add("2026-10-31", "CINE MOVIE CENTER FICTICIO", "1111", "UYU", -780, "Pendiente");

const BBVA_HEADERS = ["Fecha", "Descripción", "Tarjeta", "Moneda", "Importe", "Estado"];
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const excelSerial = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000 + 25569;

function writeBbva(file: string, rows: BbvaRow[], title: string, opts: { serialDates?: boolean } = {}) {
  const aoa: (string | number | null)[][] = [[title], [], BBVA_HEADERS];
  for (const r of rows)
    aoa.push([opts.serialDates ? excelSerial(r.date) : dmy(r.date), r.desc, `****${r.card}`, r.currency, r.amount, r.status]);
  aoa.push([]);
  const totalUsd = r2(rows.filter((r) => r.currency === "USD").reduce((s, r) => s + r.amount, 0));
  const totalUyu = r2(rows.filter((r) => r.currency === "UYU").reduce((s, r) => s + r.amount, 0));
  aoa.push(["Total USD", null, null, "USD", totalUsd, null]);
  aoa.push(["Total UYU", null, null, "UYU", totalUyu, null]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (opts.serialDates) {
    for (let i = 3; i < 3 + rows.length; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: 0 })];
      if (cell) cell.z = "dd/mm/yyyy";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  writeFileSync(path.join(OUT, file), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

writeBbva("bbva-sample.xlsx", bbva, "Movimientos de tarjetas — Cuenta ficticia ****0000 — 01/08/2026 al 31/10/2026");

// bbva-overlap: 15/10–10/11. 10 duplicados + 3 pendientes ya consolidados + movimientos nuevos.
const repeated = bbva.filter((r) => r.date >= "2026-10-15" && r.date <= "2026-10-24");
const shift = (iso: string, days: number) => {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};
const pend = bbva.filter((r) => r.status === "Pendiente");
const consolidated: BbvaRow[] = pend.slice(0, 3).map((r, i) => ({ ...r, status: "Consolidado", date: shift(r.date, i === 1 ? 2 : 1), amount: r2(r.amount * 1.01) }));
const overlapNew: BbvaRow[] = [];
const addNew = (date: string, desc: string, cardNo: "1111" | "2222", currency: "USD" | "UYU", amount: number, status: BbvaRow["status"] = "Consolidado") =>
  overlapNew.push({ date, desc, card: cardNo, currency, amount, status });
addNew("2026-11-01", "ANTEL TELEFONIA", "2222", "UYU", -1890);
addNew("2026-11-03", "SUPERMERCADO DISCO FICTICIO", "1111", "UYU", -3340);
addNew("2026-11-04", "UBER *TRIP", "2222", "USD", -10.9);
addNew("2026-11-05", "AMERICAN AIRLINES", "2222", "USD", -538.4);
addNew("2026-11-06", "RESTAURANTE EL FOGON FICTICIO", "1111", "UYU", -1690);
addNew("2026-11-07", "PAGO DE TARJETA", "1111", "USD", 1500);
addNew("2026-11-09", "ANCAP ESTACION", "2222", "UYU", -2490, "Pendiente");
addNew("2026-11-10", "HOTEL RAMBLA FICTICIO", "2222", "USD", -402, "Pendiente");
const overlap = [...repeated, ...consolidated, ...overlapNew].sort((a, b) => a.date.localeCompare(b.date));
writeBbva("bbva-overlap.xlsx", overlap, "Movimientos de tarjetas — Cuenta ficticia ****0000 — 15/10/2026 al 10/11/2026", { serialDates: true });

// bbva-unknown: mismos datos que bbva-sample con encabezados distintos (mapeo manual, RF-16)
{
  const aoa: (string | number | null)[][] = [["Consulta de movimientos (formato alternativo)"], ["F. Operación", "Concepto", "Débito", "Crédito", "Div."]];
  for (const r of bbva) aoa.push([dmy(r.date), r.desc, r.amount < 0 ? Math.abs(r.amount) : null, r.amount > 0 ? r.amount : null, r.currency === "USD" ? "U$S" : "$U"]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
  writeFileSync(path.join(OUT, "bbva-unknown.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// Tasas BCE fijas para tests y e2e (FX_PROVIDER=fixture): EUR por 1 unidad.
writeFileSync(path.join(OUT, "fx-rates.json"), JSON.stringify({ USD: "0.9200", GBP: "1.1700", BRL: "0.1650", CHF: "1.0500" }, null, 2) + "\n");

const wiseNoGasto = 9;
console.log(
  JSON.stringify(
    {
      wise: { rows: wiseRows.length, gastos: wiseRows.length - wiseNoGasto, noGasto: wiseNoGasto },
      bbvaSample: { rows: bbva.length, pagos: bbva.filter((r) => r.amount > 0).length, pendientes: pend.length },
      bbvaOverlap: { rows: overlap.length, duplicados: repeated.length, reconciliados: consolidated.length, nuevos: overlapNew.length },
    },
    null,
    2,
  ),
);
