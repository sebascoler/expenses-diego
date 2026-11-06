import { Decimal } from "../calc/money";
import { parseAmount } from "./amount";
import { normalizeCurrency } from "./currency";
import { parseDate } from "./date";
import { columnIndex } from "./detect";
import { normalizeMerchant, stripAccents } from "./merchant";
import { cellText, isEmptyRow } from "./table";
import type { Cell, ParseError, ParsedRow, ParseResult } from "./types";

const NON_EXPENSE_DESC =
  /^(converted|convertiste|convertido|conversion)|topped up|top[- ]?up|added money|recarga|cashback|interest|intereses|rendimiento|balance cashback|refund|reembolso|received money|recibiste/i;
const NON_EXPENSE_ID = /^(balance|conversion|accrual|interest|cashback)/i;

function cardMerchantFromDescription(desc: string): string {
  const m = desc.match(/issued by\s+(.+)$/i);
  return m ? m[1] : desc;
}

/** Parser del extracto CSV de Wise (RF-20 a RF-22). */
export function parseWise(rows: Cell[][], headerIdx: number): ParseResult {
  const headers = rows[headerIdx].map((c) => cellText(c));
  const c = (...names: string[]) => columnIndex(headers, ...names);
  const idx = {
    id: c("TransferWise ID", "ID"),
    date: c("Date", "Created on"),
    amount: c("Amount"),
    currency: c("Currency"),
    description: c("Description"),
    merchant: c("Merchant"),
    card: c("Card Last Four Digits"),
    fees: c("Total fees"),
    exFrom: c("Exchange From"),
    exTo: c("Exchange To"),
    exToAmount: c("Exchange To Amount"),
    payer: c("Payer Name"),
    payee: c("Payee Name"),
    holder: c("Card Holder Full Name"),
  };
  const rowsOut: ParsedRow[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rowNumber = i + 1;
    if (isEmptyRow(row)) {
      skipped++;
      continue;
    }
    const date = parseDate(row[idx.date]);
    if (!date) {
      errors.push({ rowNumber, reason: `Fecha inválida: "${cellText(row[idx.date]).slice(0, 30)}"` });
      continue;
    }
    const total = parseAmount(row[idx.amount]);
    if (!total) {
      errors.push({ rowNumber, reason: "Monto vacío o inválido" });
      continue;
    }
    const currency = normalizeCurrency(row[idx.currency]);
    if (!currency) {
      errors.push({ rowNumber, reason: "Moneda desconocida" });
      continue;
    }
    const externalId = cellText(row[idx.id]) || null;
    const description = cellText(row[idx.description]);
    const fee = (idx.fees >= 0 ? parseAmount(row[idx.fees]) : null)?.abs() ?? new Decimal(0);
    const payer = stripAccents(cellText(row[idx.payer])).toLowerCase();
    const payee = stripAccents(cellText(row[idx.payee])).toLowerCase();
    const holder = stripAccents(cellText(row[idx.holder])).toLowerCase();
    const isTransfer = /^transfer/i.test(externalId ?? "") || /^sent money to|^enviaste/i.test(description);
    const ownTransfer = isTransfer && Boolean(payee) && (payee === payer || payee === holder);

    let kind: "gasto" | "no_gasto" = "gasto";
    if (total.isPositive() || NON_EXPENSE_DESC.test(description) || NON_EXPENSE_ID.test(externalId ?? "") || ownTransfer) kind = "no_gasto";

    // El Amount de Wise incluye el fee: lo separamos para poder sumarlo o no (RF-22).
    const sign = total.isNegative() ? -1 : 1;
    const net = total.abs().minus(kind === "gasto" ? fee : 0);
    let amount = net.times(sign);
    let amountCurrency = currency;
    let accountAmount: Decimal | null = null;
    let accountCurrency: string | null = null;
    const exTo = normalizeCurrency(idx.exTo >= 0 ? row[idx.exTo] : null);
    const exFrom = normalizeCurrency(idx.exFrom >= 0 ? row[idx.exFrom] : null);
    const exToAmount = idx.exToAmount >= 0 ? parseAmount(row[idx.exToAmount]) : null;
    if (kind === "gasto" && exTo && exToAmount && !exToAmount.isZero() && exTo !== currency && (!exFrom || exFrom === currency)) {
      accountAmount = amount;
      accountCurrency = currency;
      amount = exToAmount.abs().times(sign);
      amountCurrency = exTo;
    }

    const rawMerchant = isTransfer
      ? "Transferencia enviada"
      : cellText(idx.merchant >= 0 ? row[idx.merchant] : null) || cardMerchantFromDescription(description);

    rowsOut.push({
      rowNumber,
      source: "wise",
      externalId,
      date,
      description,
      merchant: normalizeMerchant(rawMerchant),
      amount,
      currency: amountCurrency,
      accountAmount,
      accountCurrency,
      feeAmount: kind === "gasto" && !fee.isZero() ? fee : null,
      feeCurrency: kind === "gasto" && !fee.isZero() ? currency : null,
      cardLast4: cellText(idx.card >= 0 ? row[idx.card] : null).replace(/\D/g, "").slice(-4) || null,
      bankStatus: null,
      kind,
    });
  }
  return { source: "wise", rows: rowsOut, errors, skipped };
}
