import { describe, expect, it } from "vitest";
import { lineAmounts, mileageEur, tollEur } from "@/lib/calc/money";
import { reportTotal, tripTotal, txEur } from "@/lib/calc/totals";

const base = { feeAmount: null, feeFxRate: null, surchargeEnabled: false, surchargePct: "0" };

describe("cálculos con valores fijos (§8, §16.10)", () => {
  it("recargo del 3% de BBVA, en columna aparte", () => {
    const r = lineAmounts({ ...base, amount: "-100", fxRate: "0.92", surchargeEnabled: true, surchargePct: "3" }, { addFee: false });
    expect(r.surcharge.toString()).toBe("3");
    expect(r.totalOriginal.toString()).toBe("103");
    expect(r.eur?.toFixed(2)).toBe("94.76");
  });
  it("sin el toggle del 3% no hay recargo", () => {
    const r = lineAmounts({ ...base, amount: "-100", fxRate: "0.92", surchargePct: "3" }, { addFee: false });
    expect(r.eur?.toFixed(2)).toBe("92.00");
  });
  it("fee de Wise en la moneda de la cuenta (configurable)", () => {
    const line = { ...base, amount: "-2450", fxRate: "0.2439020408", feeAmount: "2.69", feeFxRate: "1" };
    expect(lineAmounts(line, { addFee: true }).eur?.toFixed(2)).toBe("600.25");
    expect(lineAmounts(line, { addFee: false }).eur?.toFixed(2)).toBe("597.56");
  });
  it("km: (1250 − 200) × 0,35 = € 367,50", () => {
    expect(mileageEur("1250", "200", "0.35").toFixed(2)).toBe("367.50");
  });
  it("peajes en otra moneda", () => {
    expect(tollEur("455", "0.0219780220")?.toFixed(2)).toBe("10.00");
    expect(tollEur("455", null)).toBeNull();
  });
  it("sin tipo de cambio la línea no suma y se marca", () => {
    expect(lineAmounts({ ...base, amount: "-10", fxRate: null }, { addFee: true }).eur).toBeNull();
  });
  it("total del viaje y de la rendición", () => {
    const tx = (amount: string, fxRate: string | null, applies: boolean | null, extra = {}) => ({ ...base, amount, currency: "USD", fxRate, applies, source: "bbva", ...extra });
    const t1 = tripTotal(
      [tx("-100", "0.92", true, { surchargeEnabled: true, surchargePct: "3" }), tx("-50", "0.92", false), tx("-20", "0.92", null), tx("-10", null, true)],
      [{ kmTotal: "1250", kmDeduction: "200", rateEur: "0.35" }],
      [{ amount: "12.5", currency: "EUR", fxRate: "1" }],
      { addWiseFee: true },
    );
    expect(t1.expensesEur.toFixed(2)).toBe("94.76");
    expect(t1.mileageEur.toFixed(2)).toBe("367.50");
    expect(t1.tollsEur.toFixed(2)).toBe("12.50");
    expect(t1.totalEur.toFixed(2)).toBe("474.76");
    expect(t1.missingFx).toBe(1);
    const t2 = tripTotal([{ ...tx("-30", "1", true), currency: "EUR", source: "wise" }], [], [], { addWiseFee: true });
    expect(reportTotal([t1, t2]).toFixed(2)).toBe("504.76");
  });
  it("el fee solo se suma en Wise", () => {
    const tx = { ...base, amount: "-10", currency: "EUR", fxRate: "1", feeAmount: "1", feeFxRate: "1" };
    expect(txEur({ ...tx, source: "wise" }, { addWiseFee: true })?.toFixed(2)).toBe("11.00");
    expect(txEur({ ...tx, source: "bbva" }, { addWiseFee: true })?.toFixed(2)).toBe("10.00");
  });
});
