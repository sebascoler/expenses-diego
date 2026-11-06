import "server-only";
import { eq, inArray, or } from "drizzle-orm";
import { toDb } from "../calc/money";
import { txEur } from "../calc/totals";
import { classifyTransactions } from "../classify/pipeline";
import { encrypt, sha256Hex } from "../crypto";
import type { DB } from "../db/client";
import { importProfiles, imports, transactions, type NewTransaction } from "../db/schema";
import { audit } from "../audit";
import { FxResolver, type FxResult } from "../fx";
import { parseBbva } from "../parsers/bbva";
import { columnMappingSchema, parseWithMapping } from "../parsers/column-map";
import { detectSource, findHeaderRow, headerList, headerSignature } from "../parsers/detect";
import { FileValidationError, readTable, cellText } from "../parsers/table";
import type { ColumnMapping, ParseError, ParseResult } from "../parsers/types";
import { parseWise } from "../parsers/wise";
import { cardTypeFor, getSettings } from "../settings";
import { dedupKeys } from "./dedup";
import { findPendingMatch } from "./reconcile";

export interface ImportSummary {
  importId: string;
  source: "wise" | "bbva";
  fileName: string;
  rowsRead: number;
  rowsNew: number;
  rowsDup: number;
  rowsIgnored: number;
  rowsReconciled: number;
  rowsAmbiguous: number;
  errors: ParseError[];
  dateFrom: string | null;
  dateTo: string | null;
  usedProfile: boolean;
}

export type ImportOutcome =
  | { status: "done"; summary: ImportSummary }
  | { status: "duplicate_file"; fileName: string; importedAt: string }
  | { status: "needs_mapping"; fileName: string; headers: string[]; sample: string[][]; reason: string }
  | { status: "invalid"; fileName: string; message: string };

export interface ImportInput {
  buffer: Buffer;
  fileName: string;
  /** Mapeo manual (RF-16). Si viene, se guarda como perfil para la próxima vez. */
  mapping?: ColumnMapping;
}

export async function importFile(db: DB, input: ImportInput): Promise<ImportOutcome> {
  const { buffer, fileName } = input;
  const fileSha = sha256Hex(buffer);
  const [already] = await db.select().from(imports).where(eq(imports.fileSha256, fileSha)).limit(1);
  if (already) return { status: "duplicate_file", fileName, importedAt: already.createdAt.toISOString() };

  let table;
  try {
    table = readTable(buffer, fileName);
  } catch (err) {
    if (err instanceof FileValidationError) return { status: "invalid", fileName, message: err.message };
    throw err;
  }
  const headerIdx = findHeaderRow(table.rows);
  if (headerIdx < 0) return { status: "invalid", fileName, message: "No encontramos la fila de encabezados del archivo." };
  const headers = headerList(table.rows[headerIdx]);
  const signature = headerSignature(headers);

  let parsed: ParseResult;
  let usedProfile = false;
  if (input.mapping) {
    const mapping = columnMappingSchema.parse(input.mapping);
    parsed = parseWithMapping(table.rows, headerIdx, mapping);
    await db
      .insert(importProfiles)
      .values({ source: mapping.source, headerSignature: signature, mapping })
      .onConflictDoUpdate({ target: importProfiles.headerSignature, set: { mapping, source: mapping.source } });
  } else {
    const [profile] = await db.select().from(importProfiles).where(eq(importProfiles.headerSignature, signature)).limit(1);
    const detected = detectSource(headers);
    if (profile) {
      const mapping = columnMappingSchema.safeParse(profile.mapping);
      if (!mapping.success) return needsMapping(fileName, table.rows, headerIdx, headers, "El perfil guardado para este archivo es inválido.");
      parsed = parseWithMapping(table.rows, headerIdx, mapping.data);
      usedProfile = true;
    } else if (detected === "wise") parsed = parseWise(table.rows, headerIdx);
    else if (detected === "bbva") parsed = parseBbva(table.rows, headerIdx);
    else return needsMapping(fileName, table.rows, headerIdx, headers, "No reconocimos las columnas del archivo.");
  }

  // Un formato que no deja ninguna fila válida es un error claro, no una importación vacía (§14).
  if (parsed.rows.length === 0 && parsed.errors.length > 0 && !input.mapping)
    return needsMapping(fileName, table.rows, headerIdx, headers, "Las columnas no coinciden con el formato esperado.");

  const settings = await getSettings(db);
  const keys = dedupKeys(parsed.rows);
  const existing = keys.length
    ? await db
        .select({ key: transactions.dedupKey, prev: transactions.dedupKeyPrev })
        .from(transactions)
        .where(or(inArray(transactions.dedupKey, keys), inArray(transactions.dedupKeyPrev, keys)))
    : [];
  const known = new Set(existing.flatMap((e) => [e.key, e.prev]).filter(Boolean) as string[]);

  const fx = new FxResolver(db);
  await fx.prefetch(
    parsed.rows.flatMap((r) => [
      { currency: r.currency, date: r.date },
      ...(r.accountCurrency ? [{ currency: r.accountCurrency, date: r.date }] : []),
    ]),
  );

  const dates = parsed.rows.map((r) => r.date).sort();
  const summary: ImportSummary = {
    importId: "",
    source: parsed.source,
    fileName,
    rowsRead: parsed.rows.length + parsed.errors.length,
    rowsNew: 0,
    rowsDup: 0,
    rowsIgnored: 0,
    rowsReconciled: 0,
    rowsAmbiguous: 0,
    errors: parsed.errors,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    usedProfile,
  };

  // Tipos de cambio resueltos antes de abrir la transacción (PGlite usa una sola conexión).
  const rates: FxResult[] = [];
  for (const row of parsed.rows)
    rates.push(await fx.resolve({ source: row.source, date: row.date, amount: row.amount, currency: row.currency, accountAmount: row.accountAmount, accountCurrency: row.accountCurrency, feeCurrency: row.feeCurrency }));

  const newIds: string[] = [];
  await db.transaction(async (tx) => {
    const [imp] = await tx
      .insert(imports)
      .values({ source: parsed.source, fileSha256: fileSha, dateFrom: summary.dateFrom, dateTo: summary.dateTo, rowsRead: summary.rowsRead })
      .returning({ id: imports.id });
    summary.importId = imp.id;
    const touched = new Set<string>();

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i];
      const key = keys[i];
      if (known.has(key)) {
        summary.rowsDup++;
        continue;
      }
      known.add(key);
      const rate = rates[i];
      const isBbva = row.source === "bbva";
      const calc = {
        amount: toDb(row.amount),
        currency: row.currency,
        fxRate: rate.fxRate ? rate.fxRate.toFixed(10) : null,
        feeAmount: row.feeAmount ? toDb(row.feeAmount) : null,
        feeFxRate: rate.feeFxRate ? rate.feeFxRate.toFixed(10) : null,
        surchargeEnabled: isBbva && row.kind === "gasto",
        surchargePct: isBbva ? settings.bbvaSurchargePct : "0",
        source: row.source,
      };
      const eur = txEur(calc, { addWiseFee: settings.addWiseFee });

      const match = await findPendingMatch(tx, row, touched);
      if (match.type === "single") {
        touched.add(match.tx.id);
        if (match.tx.reportId) {
          // Ya rendido: nunca se modifica ni se duplica (RF-29).
          summary.rowsDup++;
          continue;
        }
        // Se conservan la clasificación y las notas de Diego; se actualizan monto, estado y tipo de cambio.
        await tx
          .update(transactions)
          .set({
            dedupKeyPrev: match.tx.dedupKey,
            dedupKey: key,
            importId: imp.id,
            amount: calc.amount,
            bankStatus: "consolidado",
            fxRate: calc.fxRate,
            fxSource: rate.fxSource,
            fxDate: rate.fxDate,
            amountEur: eur ? toDb(eur) : null,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, match.tx.id));
        summary.rowsReconciled++;
        continue;
      }

      const values: NewTransaction = {
        importId: imp.id,
        source: row.source,
        externalId: row.externalId,
        dedupKey: key,
        date: row.date,
        merchantNormalized: row.merchant,
        descriptionEnc: encrypt(row.description),
        amount: calc.amount,
        currency: row.currency,
        feeAmount: calc.feeAmount,
        feeCurrency: row.feeCurrency,
        feeFxRate: calc.feeFxRate,
        cardLast4: row.cardLast4,
        cardType: isBbva ? cardTypeFor(settings, row.cardLast4) : null,
        bankStatus: row.bankStatus,
        kind: row.kind,
        surchargePct: calc.surchargePct,
        surchargeEnabled: calc.surchargeEnabled,
        accountAmount: row.accountAmount ? toDb(row.accountAmount) : null,
        accountCurrency: row.accountCurrency,
        fxRate: calc.fxRate,
        fxSource: rate.fxSource,
        fxDate: rate.fxDate,
        amountEur: eur ? toDb(eur) : null,
        possibleMatchId: match.type === "ambiguous" ? match.candidates[0].id : null,
      };
      const [ins] = await tx.insert(transactions).values(values).returning({ id: transactions.id });
      if (row.kind === "no_gasto") summary.rowsIgnored++;
      else {
        summary.rowsNew++;
        newIds.push(ins.id);
        if (match.type === "ambiguous") summary.rowsAmbiguous++;
      }
    }
    await tx
      .update(imports)
      .set({ rowsNew: summary.rowsNew, rowsDup: summary.rowsDup, rowsIgnored: summary.rowsIgnored, rowsReconciled: summary.rowsReconciled })
      .where(eq(imports.id, imp.id));
    await audit(tx, "import", "imports", imp.id, {
      source: parsed.source,
      rowsRead: summary.rowsRead,
      rowsNew: summary.rowsNew,
      rowsDup: summary.rowsDup,
      rowsIgnored: summary.rowsIgnored,
      rowsReconciled: summary.rowsReconciled,
      errors: summary.errors.length,
    });
  });

  // Clasificación (reglas → tarjeta → IA). Si falla, los gastos quedan "sin clasificar" (RF-34).
  try {
    await classifyTransactions(db, { txIds: newIds });
  } catch (err) {
    console.error("[import] Falló la clasificación:", err instanceof Error ? err.name : "error");
  }
  return { status: "done", summary };
}

function needsMapping(fileName: string, rows: ReturnType<typeof readTable>["rows"], headerIdx: number, headers: string[], reason: string): ImportOutcome {
  const sample = rows
    .slice(headerIdx + 1)
    .filter((r) => r && r.some((c) => cellText(c) !== ""))
    .slice(0, 5)
    .map((r) => headers.map((_, i) => cellText(r[i]).slice(0, 60)));
  return { status: "needs_mapping", fileName, headers, sample, reason };
}
