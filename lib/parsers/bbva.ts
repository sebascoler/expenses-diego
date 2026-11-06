import { parseWithMapping } from "./column-map";
import { columnIndex } from "./detect";
import { cellText } from "./table";
import type { Cell, ColumnMapping, ParseResult } from "./types";

/** Mapeo por defecto del Excel de BBVA (encabezados supuestos, §16.6). */
export function bbvaDefaultMapping(headers: string[]): ColumnMapping {
  const pick = (...names: string[]) => {
    const i = columnIndex(headers, ...names);
    return i >= 0 ? headers[i] : null;
  };
  return {
    source: "bbva",
    date: pick("Fecha", "Fecha operación", "Fecha de operación") ?? "Fecha",
    description: pick("Descripción", "Concepto", "Comercio") ?? "Descripción",
    amount: pick("Importe", "Monto"),
    currency: pick("Moneda", "Divisa"),
    defaultCurrency: "USD",
    card: pick("Tarjeta", "Nº tarjeta", "Numero de tarjeta"),
    status: pick("Estado", "Situación"),
  };
}

export function parseBbva(rows: Cell[][], headerIdx: number): ParseResult {
  const headers = rows[headerIdx].map((c) => cellText(c));
  return parseWithMapping(rows, headerIdx, bbvaDefaultMapping(headers));
}
