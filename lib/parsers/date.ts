/**
 * Parseo tolerante de fechas (RF-17). Devuelve "aaaa-mm-dd" o null.
 * Soporta dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd, con hora, número serial de Excel y Date.
 * Las fechas con día primero se interpretan siempre como dd/mm (formato rioplatense y europeo).
 */
export function parseDate(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return iso(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === "number") return fromExcelSerial(input);
  const s = String(input).trim();
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T\s,].*)?$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return iso(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  // Excel cuenta desde 1899-12-30 (incluye el bug del 29/02/1900).
  const ms = Math.round((Math.floor(serial) - 25569) * 86_400_000);
  const dt = new Date(ms);
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}
