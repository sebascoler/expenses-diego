import "server-only";

/** Monedas con tasa de referencia del BCE (ARS, UYU, PEN, CLP y MAD no están). */
export const ECB_CURRENCIES = new Set([
  "USD", "JPY", "BGN", "CZK", "DKK", "GBP", "HUF", "PLN", "RON", "SEK", "CHF", "ISK", "NOK", "TRY",
  "AUD", "BRL", "CAD", "CNY", "HKD", "IDR", "ILS", "INR", "KRW", "MXN", "MYR", "NZD", "PHP", "SGD", "THB", "ZAR",
]);

const BASE_URL = "https://api.frankfurter.dev/v1";

/**
 * Serie de tasas BCE (EUR por 1 unidad de `currency`) entre dos fechas, vía Frankfurter (sin key).
 * Devuelve solo los días hábiles publicados. Ante cualquier error devuelve un mapa vacío.
 */
export async function fetchEcbSeries(currency: string, from: string, to: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ECB_CURRENCIES.has(currency)) return out;
  try {
    const res = await fetch(`${BASE_URL}/${from}..${to}?base=${currency}&symbols=EUR`, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return out;
    const json = (await res.json()) as { rates?: Record<string, { EUR?: number }> };
    for (const [date, r] of Object.entries(json.rates ?? {})) if (r.EUR) out.set(date, String(r.EUR));
  } catch {
    // sin red o API caída: la línea queda con tipo de cambio pendiente (§16.5)
  }
  return out;
}
