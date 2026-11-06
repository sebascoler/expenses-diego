import ExcelJS from "exceljs";
import { formatDate } from "../format";
import type { ReportData } from "./build";
import { DETAIL_HEADERS, detailRows } from "./rows";
import { sanitizeCell } from "./sanitize";

const EUR_FMT = '"€" #,##0.00';

/** Excel con hoja de resumen y hoja de detalle (RF-73). */
export async function reportXlsx(r: ReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Expenses Diego";
  const summary = wb.addWorksheet("Resumen");
  summary.columns = [{ width: 42 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];
  summary.addRow([sanitizeCell(`Rendición de gastos — ${r.reportName}`)]).font = { bold: true, size: 14 };
  summary.addRow([`Período: ${formatDate(r.dateFrom)} al ${formatDate(r.dateTo)}`]);
  summary.addRow([`Generado: ${formatDate(r.generatedOn)}`]);
  summary.addRow([]);
  const head = summary.addRow(["Viaje", "Gastos (EUR)", "Km (EUR)", "Peajes (EUR)", "Total (EUR)"]);
  head.font = { bold: true };
  for (const t of r.trips) {
    const row = summary.addRow([sanitizeCell(t.name), Number(t.totals.expensesEur), Number(t.totals.mileageEur), Number(t.totals.tollsEur), Number(t.totals.totalEur)]);
    for (let c = 2; c <= 5; c++) row.getCell(c).numFmt = EUR_FMT;
  }
  const total = summary.addRow(["Total general", null, null, null, Number(r.totalEur)]);
  total.font = { bold: true };
  total.getCell(5).numFmt = EUR_FMT;
  summary.addRow([]);
  summary.addRow(["Por categoría"]).font = { bold: true };
  for (const c of r.byCategory) {
    const row = summary.addRow([sanitizeCell(c.name), Number(c.eur)]);
    row.getCell(2).numFmt = EUR_FMT;
  }

  const detail = wb.addWorksheet("Detalle");
  detail.addRow(DETAIL_HEADERS).font = { bold: true };
  for (const row of detailRows(r)) detail.addRow(row.map((c) => (typeof c === "number" ? c : sanitizeCell(c))));
  detail.columns.forEach((col, i) => {
    col.width = [22, 12, 32, 22, 10, 8, 14, 10, 8, 14, 14, 14, 12, 30][i] ?? 14;
  });
  detail.getColumn(13).numFmt = EUR_FMT;
  detail.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
