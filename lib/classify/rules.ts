import type { Rule } from "../db/schema";
import { stripAccents } from "../parsers/merchant";

export function ruleMatches(rule: Pick<Rule, "matchType" | "pattern">, merchant: string): boolean {
  const m = stripAccents(merchant).toUpperCase();
  const p = stripAccents(rule.pattern).toUpperCase().trim();
  if (!p) return false;
  switch (rule.matchType) {
    case "merchant_equals":
      return m === p;
    case "merchant_contains":
      return m.includes(p);
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(merchant);
      } catch {
        return false;
      }
  }
}

const PRIORITY = { merchant_equals: 0, merchant_contains: 1, regex: 2 } as const;

/** Primera regla activa que aplica (RF-30): exactas primero, después "contiene", después regex. */
export function findRule<R extends Pick<Rule, "matchType" | "pattern" | "active">>(rules: R[], merchant: string): R | null {
  const sorted = [...rules].filter((r) => r.active).sort((a, b) => PRIORITY[a.matchType] - PRIORITY[b.matchType]);
  return sorted.find((r) => ruleMatches(r, merchant)) ?? null;
}

/**
 * Pistas deterministas de categoría por palabra clave. Solo proponen la categoría (nunca si aplica),
 * para completar lo que deciden la regla de tarjeta o una regla sin categoría.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(AIRLINES?|AEROLINEAS?|LINEAS AEREAS|IBERIA|LATAM|VUELING|RYANAIR|COPA|AIR EUROPA|AEROMEXICO|BUQUEBUS|AMERICAN AIRLINES)\b/, "Pasajes aéreos"],
  [/\b(HOTEL|HOSTAL|AIRBNB|BOOKING|POSADA|APART)\b/, "Alojamiento"],
  [/\b(UBER|CABIFY|TAXI|DIDI|BOLT|METRO|BUS|RENFE|TREN)\b/, "Transporte local (taxi/Uber/bus)"],
  [/\b(REPSOL|PRIMAX|ANCAP|YPF|SHELL|PETROBRAS|AXION|CEPSA|BP|GALP|COMBUSTIBLE|NAFTA|ESTACION)\b/, "Combustible"],
  [/\b(EUROPCAR|HERTZ|AVIS|SIXT|BUDGET|LOCALIZA|RENT A CAR)\b/, "Alquiler de auto"],
  [/\b(PEAJE|PEAJES|AUTOPISTA|TOLL)\b/, "Peajes"],
  [/\b(RESTAURANTE|RESTAURANT|PARRILLA|CEVICHERIA|CAFETERIA|CAFE|BAR|COMIDA|PIZZERIA)\b/, "Comidas"],
  [/\b(MOVISTAR|ANTEL|CLARO|VODAFONE|ORANGE|TELEFONIA|ROAMING)\b/, "Comunicaciones"],
  [/\b(AMAZON|OFFICE|LIBRERIA|PAPELERIA)\b/, "Compras oficina/terceros"],
];

export function categoryHint(merchant: string): string | null {
  const m = stripAccents(merchant).toUpperCase();
  for (const [re, name] of CATEGORY_HINTS) if (re.test(m)) return name;
  return null;
}
