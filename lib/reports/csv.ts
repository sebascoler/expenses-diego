import Papa from "papaparse";
import type { ReportData } from "./build";
import { DETAIL_HEADERS, detailRows } from "./rows";
import { sanitizeCell } from "./sanitize";

/** CSV de detalle (separador ;, coma decimal para Excel en español, BOM UTF-8). */
export function reportCsv(r: ReportData): string {
  const rows = detailRows(r).map((row) => row.map((c) => (typeof c === "number" ? String(c).replace(".", ",") : sanitizeCell(c))));
  return "﻿" + Papa.unparse({ fields: DETAIL_HEADERS, data: rows }, { delimiter: ";", newline: "\r\n" });
}
