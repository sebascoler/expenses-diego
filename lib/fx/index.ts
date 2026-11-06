import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { d, Decimal } from "../calc/money";
import type { DbOrTx } from "../db/client";
import { fxRates } from "../db/schema";
import { env } from "../env";
import { addDays } from "../format";
import { ECB_CURRENCIES, fetchEcbSeries } from "./frankfurter";

export type FxSource = "wise" | "bbva" | "ecb" | "manual" | "eur" | "pendiente";

export interface FxInput {
  source: "wise" | "bbva" | "manual";
  date: string;
  amount: Decimal;
  currency: string;
  accountAmount?: Decimal | null;
  accountCurrency?: string | null;
  feeCurrency?: string | null;
}

export interface FxResult {
  fxRate: Decimal | null;
  fxSource: FxSource;
  fxDate: string | null;
  feeFxRate: Decimal | null;
}

let fixtureRates: Record<string, string> | null = null;
function fixture(currency: string): string | null {
  fixtureRates ??= JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "fx-rates.json"), "utf8")) as Record<string, string>;
  return fixtureRates[currency] ?? null;
}

/** Resolución de tipo de cambio (RF-61): fuente del movimiento → BCE → manual → pendiente. Cachea en `fx_rates`. */
export class FxResolver {
  private cache = new Map<string, Decimal | null>();
  constructor(private db: DbOrTx) {}

  /** Precarga las tasas BCE necesarias, con una sola consulta por moneda. */
  async prefetch(pairs: { currency: string; date: string }[]) {
    const byCurrency = new Map<string, string[]>();
    for (const p of pairs) {
      if (p.currency === "EUR" || !ECB_CURRENCIES.has(p.currency)) continue;
      const list = byCurrency.get(p.currency) ?? [];
      list.push(p.date);
      byCurrency.set(p.currency, list);
    }
    for (const [currency, dates] of byCurrency) {
      const sorted = [...new Set(dates)].sort();
      const from = addDays(sorted[0], -7);
      const to = sorted[sorted.length - 1];
      const cached = await this.db
        .select()
        .from(fxRates)
        .where(and(eq(fxRates.base, currency), eq(fxRates.quote, "EUR"), gte(fxRates.date, from), lte(fxRates.date, to)));
      const known = new Map(cached.filter((c) => c.source === "ecb").map((c) => [c.date, c.rate]));
      const missing = sorted.filter((dt) => !this.lookup(known, dt));
      if (missing.length > 0) {
        let fetched: Map<string, string>;
        if (env.fxProvider === "fixture") {
          const r = fixture(currency);
          fetched = new Map(r ? sorted.map((dt) => [dt, r]) : []);
        } else {
          fetched = await fetchEcbSeries(currency, from, to);
        }
        for (const [date, rate] of fetched) {
          known.set(date, rate);
          await this.db
            .insert(fxRates)
            .values({ date, base: currency, quote: "EUR", rate, source: "ecb" })
            .onConflictDoNothing();
        }
      }
      for (const dt of sorted) {
        const r = this.lookup(known, dt);
        this.cache.set(`${currency}|${dt}`, r ? d(r) : null);
      }
    }
  }

  /** Busca la tasa del día o la del día hábil anterior (hasta 7 días). */
  private lookup(known: Map<string, string>, date: string): string | null {
    for (let i = 0; i <= 7; i++) {
      const r = known.get(addDays(date, -i));
      if (r) return r;
    }
    return null;
  }

  async ecb(currency: string, date: string): Promise<Decimal | null> {
    if (currency === "EUR") return new Decimal(1);
    const key = `${currency}|${date}`;
    if (!this.cache.has(key)) await this.prefetch([{ currency, date }]);
    return this.cache.get(key) ?? null;
  }

  /** Última tasa manual cargada para la moneda (hasta 60 días antes). */
  async manual(currency: string, date: string): Promise<Decimal | null> {
    const [row] = await this.db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.base, currency), eq(fxRates.quote, "EUR"), eq(fxRates.source, "manual"), lte(fxRates.date, addDays(date, 30)), gte(fxRates.date, addDays(date, -60))))
      .orderBy(desc(fxRates.date))
      .limit(1);
    return row ? d(row.rate) : null;
  }

  async toEur(currency: string, date: string): Promise<{ rate: Decimal | null; source: FxSource }> {
    if (currency === "EUR") return { rate: new Decimal(1), source: "eur" };
    const ecb = await this.ecb(currency, date);
    if (ecb) return { rate: ecb, source: "ecb" };
    const manual = await this.manual(currency, date);
    if (manual) return { rate: manual, source: "manual" };
    return { rate: null, source: "pendiente" };
  }

  async resolve(tx: FxInput): Promise<FxResult> {
    let fxRate: Decimal | null = null;
    let fxSource: FxSource = "pendiente";
    let accountRate: Decimal | null = null;
    if (tx.currency === "EUR") {
      fxRate = new Decimal(1);
      fxSource = "eur";
    } else if (tx.accountAmount && tx.accountCurrency && !tx.amount.isZero()) {
      // (1) Tipo de cambio que trae el propio movimiento: moneda original → moneda de la cuenta
      const r1 = tx.accountAmount.abs().dividedBy(tx.amount.abs());
      if (tx.accountCurrency === "EUR") {
        fxRate = r1;
        fxSource = tx.source === "manual" ? "manual" : tx.source;
        accountRate = new Decimal(1);
      } else {
        // (2) Moneda de la cuenta → EUR con el BCE
        const r2 = await this.toEur(tx.accountCurrency, tx.date);
        accountRate = r2.rate;
        if (r2.rate) {
          fxRate = r1.times(r2.rate);
          fxSource = r2.source;
        }
      }
    } else {
      const r = await this.toEur(tx.currency, tx.date);
      fxRate = r.rate;
      fxSource = r.source;
    }
    let feeFxRate: Decimal | null = null;
    if (tx.feeCurrency) {
      if (tx.feeCurrency === "EUR") feeFxRate = new Decimal(1);
      else if (tx.feeCurrency === tx.currency) feeFxRate = fxRate;
      else if (tx.feeCurrency === tx.accountCurrency) feeFxRate = accountRate;
      else feeFxRate = (await this.toEur(tx.feeCurrency, tx.date)).rate;
    }
    return { fxRate, fxSource: fxRate ? fxSource : "pendiente", fxDate: fxRate ? tx.date : null, feeFxRate };
  }
}
