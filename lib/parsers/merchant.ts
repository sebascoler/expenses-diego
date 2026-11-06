/** Normalización de comercio: sin acentos, sin números largos (referencias), sin prefijos bancarios. */
const PREFIXES = [
  /^card transaction of [\d.,]+ [a-z]{3} issued by\s+/i,
  /^card transaction of [\d.,]+\s*[a-z]{3}\s*/i,
  /^(compra|pago|cargo|consumo)( con tarjeta| tarjeta| en| de)?\s+/i,
  /^pos\s+/i,
];

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return "SIN DESCRIPCION";
  let s = stripAccents(String(raw)).trim();
  for (const p of PREFIXES) s = s.replace(p, "");
  s = s
    .replace(/[*#_|]/g, " ")
    .replace(/\b\d{3,}\b/g, " ") // referencias, números de operación
    .replace(/\b[A-Z]{2}\d+\b/gi, " ")
    .replace(/[^\p{L}\p{N}.&' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return s || "SIN DESCRIPCION";
}

/** Normalización para comparar encabezados de columnas. */
export function normalizeHeader(h: unknown): string {
  return stripAccents(String(h ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
