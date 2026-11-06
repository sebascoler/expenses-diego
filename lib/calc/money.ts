import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalLike = Decimal | string | number | null | undefined;

export const ZERO = new Decimal(0);

export function d(value: DecimalLike): Decimal {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === "") return ZERO;
  return new Decimal(value);
}

export function round2(value: DecimalLike): Decimal {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), ZERO);
}

/** Para guardar en columnas numeric(14,4). */
export function toDb(value: DecimalLike, dp = 4): string {
  return d(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
}

export interface LineInput {
  amount: DecimalLike;
  fxRate: DecimalLike | null;
  feeAmount?: DecimalLike | null;
  feeFxRate?: DecimalLike | null;
  surchargeEnabled: boolean;
  surchargePct: DecimalLike;
}

export interface LineBreakdown {
  base: Decimal;
  fee: Decimal;
  surcharge: Decimal;
  totalOriginal: Decimal;
  /** null si falta el tipo de cambio. */
  eur: Decimal | null;
}

/**
 * Monto reembolsable por línea (§8):
 *   base    = |amount|
 *   recargo = base × pct (solo si surcharge_enabled)
 *   total   = (base + recargo) × fx_rate + fee × fee_fx_rate (si se suma el fee)
 * El fee de Wise está en la moneda de la cuenta, por eso tiene su propio tipo de cambio.
 */
export function lineAmounts(line: LineInput, opts: { addFee: boolean }): LineBreakdown {
  const base = d(line.amount).abs();
  const surcharge = line.surchargeEnabled ? base.times(d(line.surchargePct)).dividedBy(100) : ZERO;
  const fee = opts.addFee && line.feeAmount ? d(line.feeAmount).abs() : ZERO;
  const totalOriginal = base.plus(surcharge);
  let eur: Decimal | null = null;
  if (line.fxRate !== null && line.fxRate !== undefined && line.fxRate !== "") {
    const feeRate = line.feeFxRate ?? line.fxRate;
    eur = round2(totalOriginal.times(d(line.fxRate)).plus(fee.times(d(feeRate))));
  }
  return { base, fee, surcharge, totalOriginal, eur };
}

/** (km_totales − km_descuento) × tarifa, redondeado a 2 decimales. */
export function mileageEur(kmTotal: DecimalLike, kmDeduction: DecimalLike, rateEur: DecimalLike): Decimal {
  const km = Decimal.max(d(kmTotal).minus(d(kmDeduction)), ZERO);
  return round2(km.times(d(rateEur)));
}

export function tollEur(amount: DecimalLike, fxRate: DecimalLike | null): Decimal | null {
  if (fxRate === null || fxRate === undefined || fxRate === "") return null;
  return round2(d(amount).abs().times(d(fxRate)));
}
