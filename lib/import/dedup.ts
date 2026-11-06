import "server-only";
import { dedupHmac } from "../crypto";
import { normalizeMerchant } from "../parsers/merchant";
import type { ParsedRow } from "../parsers/types";

/**
 * dedup_key = HMAC-SHA256 de (fuente, ID externo) o de (fecha, monto, moneda, descripción normalizada, últimos 4) (RF-27).
 * Para filas sin ID que se repiten idénticas dentro de un archivo (dos cafés iguales el mismo día) se agrega
 * el número de ocurrencia, así re-importar el mismo archivo o uno solapado da las mismas claves.
 */
export function dedupKeys(rows: ParsedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    let base: string;
    if (r.externalId) {
      // Las conversiones de Wise traen el mismo ID en las dos patas (una por balance)
      base = `${r.source}|id|${r.externalId}|${r.currency}|${r.amount.isNegative() ? "-" : "+"}`;
    } else {
      base = [r.source, r.date, r.amount.toFixed(2), r.currency, normalizeMerchant(r.description), r.cardLast4 ?? ""].join("|");
    }
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return dedupHmac(n === 0 ? base : `${base}#${n}`);
  });
}
