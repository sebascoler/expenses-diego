import { Decimal } from "../calc/money";

/**
 * Parseo tolerante de montos (RF-17): 1.234,56 · 1,234.56 · (12,50) · -12.50 · 12,50- · "€ 12,50" · números de Excel.
 * Devuelve null si no se puede interpretar.
 */
export function parseAmount(input: unknown): Decimal | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? new Decimal(input.toString()) : null;
  let s = String(input).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s ]/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  // Quitar símbolos de moneda y letras (EUR, US$, S/, $U…)
  s = s.replace(/[^\d.,+-]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!s || /[+-]/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    normalized = parts.length > 2 ? parts.join("") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    normalized = parts.length > 2 ? parts.join("") : s;
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized) && !/^\.\d+$/.test(normalized)) return null;
  const value = new Decimal(normalized);
  return negative ? value.negated() : value;
}
