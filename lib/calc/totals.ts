import { d, Decimal, lineAmounts, mileageEur, round2, sum, tollEur, ZERO } from "./money";

/** Campos mínimos de una transacción para calcular su monto reembolsable. */
export interface TxCalcFields {
  amount: string;
  currency: string;
  fxRate: string | null;
  feeAmount: string | null;
  feeFxRate: string | null;
  surchargeEnabled: boolean;
  surchargePct: string;
  source: string;
}

export function txEur(tx: TxCalcFields, opts: { addWiseFee: boolean }): Decimal | null {
  return lineAmounts(
    { amount: tx.amount, fxRate: tx.fxRate, feeAmount: tx.feeAmount, feeFxRate: tx.feeFxRate, surchargeEnabled: tx.surchargeEnabled, surchargePct: tx.surchargePct },
    { addFee: opts.addWiseFee && tx.source === "wise" },
  ).eur;
}

export function txBreakdown(tx: TxCalcFields, opts: { addWiseFee: boolean }) {
  return lineAmounts(
    { amount: tx.amount, fxRate: tx.fxRate, feeAmount: tx.feeAmount, feeFxRate: tx.feeFxRate, surchargeEnabled: tx.surchargeEnabled, surchargePct: tx.surchargePct },
    { addFee: opts.addWiseFee && tx.source === "wise" },
  );
}

export interface MileageFields {
  kmTotal: string;
  kmDeduction: string;
  rateEur: string;
}
export interface TollFields {
  amount: string;
  currency: string;
  fxRate: string | null;
}

export interface TripTotal {
  expensesEur: Decimal;
  mileageEur: Decimal;
  tollsEur: Decimal;
  totalEur: Decimal;
  /** Líneas sin tipo de cambio (no se puede cerrar la rendición). */
  missingFx: number;
  byCurrency: Map<string, Decimal>;
}

/** viaje = Σ líneas aplica=true + Σ km + Σ peajes→EUR (§8). */
export function tripTotal(lines: (TxCalcFields & { applies: boolean | null })[], mileage: MileageFields[], tolls: TollFields[], opts: { addWiseFee: boolean }): TripTotal {
  let expenses = ZERO;
  let missingFx = 0;
  const byCurrency = new Map<string, Decimal>();
  for (const l of lines) {
    if (l.applies !== true) continue;
    const b = txBreakdown(l, opts);
    byCurrency.set(l.currency, (byCurrency.get(l.currency) ?? ZERO).plus(b.totalOriginal));
    if (b.eur === null) missingFx++;
    else expenses = expenses.plus(b.eur);
  }
  const km = sum(mileage.map((m) => mileageEur(m.kmTotal, m.kmDeduction, m.rateEur)));
  let tollsTotal = ZERO;
  for (const t of tolls) {
    const e = tollEur(t.amount, t.fxRate);
    byCurrency.set(t.currency, (byCurrency.get(t.currency) ?? ZERO).plus(d(t.amount).abs()));
    if (e === null) missingFx++;
    else tollsTotal = tollsTotal.plus(e);
  }
  return { expensesEur: round2(expenses), mileageEur: round2(km), tollsEur: round2(tollsTotal), totalEur: round2(expenses.plus(km).plus(tollsTotal)), missingFx, byCurrency };
}

/** rendición = Σ viajes del rango (incluye Gastos generales). */
export function reportTotal(tripTotals: TripTotal[]): Decimal {
  return round2(sum(tripTotals.map((t) => t.totalEur)));
}
