/** Normaliza códigos de moneda que aparecen en los extractos ("U$S", "$U", "€"…). */
export function normalizeCurrency(raw: unknown, fallback?: string | null): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return fallback ?? null;
  const map: Record<string, string> = {
    "€": "EUR",
    EUR: "EUR",
    EURO: "EUR",
    EUROS: "EUR",
    USD: "USD",
    "U$S": "USD",
    "US$": "USD",
    "U$D": "USD",
    DOLARES: "USD",
    "DÓLARES": "USD",
    UYU: "UYU",
    "$U": "UYU",
    UYP: "UYU",
    "$": "UYU",
    PESOS: "UYU",
    PEN: "PEN",
    "S/": "PEN",
    "S/.": "PEN",
    ARS: "ARS",
    CLP: "CLP",
    MAD: "MAD",
    GBP: "GBP",
    BRL: "BRL",
  };
  if (map[s]) return map[s];
  if (/^[A-Z]{3}$/.test(s)) return s;
  return fallback ?? null;
}
