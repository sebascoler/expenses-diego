import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Cell } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class FileValidationError extends Error {}

export type FileKind = "csv" | "xlsx" | "xls";

/** Valida extensión y contenido real (RF-12): firma ZIP para .xlsx, OLE2 para .xls, texto sin bytes nulos para .csv. */
export function detectFileKind(buf: Buffer, filename: string): FileKind {
  if (buf.length === 0) throw new FileValidationError("El archivo está vacío.");
  if (buf.length > MAX_FILE_BYTES) throw new FileValidationError("El archivo supera el máximo de 5 MB.");
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const isOle = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ext === "xlsx") {
    if (!isZip) throw new FileValidationError("El archivo .xlsx no es un Excel válido.");
    return "xlsx";
  }
  if (ext === "xls") {
    if (isOle) return "xls";
    if (isZip) return "xlsx";
    // Algunos bancos exportan HTML o texto con extensión .xls: SheetJS los lee igual.
    if (!buf.subarray(0, 4096).includes(0)) return "xls";
    throw new FileValidationError("El archivo .xls no es un Excel válido.");
  }
  if (ext === "csv" || ext === "txt") {
    if (isZip || isOle || buf.subarray(0, 8192).includes(0)) throw new FileValidationError("El archivo .csv no parece ser texto.");
    return "csv";
  }
  throw new FileValidationError("Formato no soportado. Subí un .csv (Wise) o un .xlsx/.xls (BBVA).");
}

function decodeText(buf: Buffer): string {
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1");
  return text.replace(/^﻿/, "");
}

export function readTable(buf: Buffer, filename: string): { kind: FileKind; rows: Cell[][] } {
  const kind = detectFileKind(buf, filename);
  if (kind === "csv") {
    const parsed = Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: false });
    return { kind, rows: parsed.data.map((r) => r.map((c) => (c === "" ? null : c))) };
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: false, dense: true });
  } catch {
    throw new FileValidationError("No se pudo leer el Excel. ¿Está dañado o protegido con contraseña?");
  }
  const first = wb.SheetNames[0];
  if (!first) throw new FileValidationError("El Excel no tiene hojas.");
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[first], { header: 1, raw: true, defval: null, blankrows: true });
  return { kind, rows };
}

export function isEmptyRow(row: Cell[] | undefined): boolean {
  return !row || row.every((c) => c === null || c === undefined || String(c).trim() === "");
}

export function cellText(c: Cell | undefined): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}
