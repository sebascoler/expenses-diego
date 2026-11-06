// Formato para la UI (cliente y servidor): dd/mm/aaaa, coma decimal y símbolo de moneda.
const SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "US$",
  UYU: "$U",
  ARS: "$",
  PEN: "S/",
  CLP: "CLP$",
  MAD: "MAD",
  GBP: "£",
  BRL: "R$",
};

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code;
}

export function formatNumber(value: string | number | { toString(): string } | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** "€ 3.412,50" */
export function formatMoney(value: string | number | { toString(): string } | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${currencySymbol(currency)} ${formatNumber(value, 2)}`;
}

/** "2026-11-06" → "06/11/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, dd] = iso.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
}

/** "2026-11-06" → "06/11" */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, dd] = iso.slice(0, 10).split("-");
  return `${dd}/${m}`;
}

export function todayIso(timeZone = "America/Argentina/Buenos_Aires"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}
