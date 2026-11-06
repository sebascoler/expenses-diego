import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });
const rate = (name: string) => numeric(name, { precision: 20, scale: 10 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const sourceEnum = pgEnum("source", ["wise", "bbva", "manual"]);
export const importSourceEnum = pgEnum("import_source", ["wise", "bbva"]);
export const cardTypeEnum = pgEnum("card_type", ["fisica", "virtual"]);
export const bankStatusEnum = pgEnum("bank_status", ["pendiente", "consolidado"]);
export const kindEnum = pgEnum("tx_kind", ["gasto", "no_gasto"]);
export const fxSourceEnum = pgEnum("fx_source", ["wise", "bbva", "ecb", "manual", "eur", "pendiente"]);
export const suggestionSourceEnum = pgEnum("suggestion_source", ["regla", "tarjeta", "ia"]);
export const confidenceEnum = pgEnum("confidence", ["alta", "media", "baja"]);
export const matchTypeEnum = pgEnum("match_type", ["merchant_equals", "merchant_contains", "regex"]);
export const ruleOriginEnum = pgEnum("rule_origin", ["manual", "aprendida"]);
export const reportStatusEnum = pgEnum("report_status", ["borrador", "cerrado"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_user_idx").on(t.username, t.createdAt), index("login_attempts_ip_idx").on(t.ipHash, t.createdAt)],
);

export const importProfiles = pgTable("import_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: importSourceEnum("source").notNull(),
  headerSignature: text("header_signature").notNull().unique(),
  mapping: jsonb("mapping").notNull(),
  createdAt: createdAt(),
});

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: importSourceEnum("source").notNull(),
  fileSha256: text("file_sha256").notNull().unique(),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  rowsRead: integer("rows_read").notNull().default(0),
  rowsNew: integer("rows_new").notNull().default(0),
  rowsDup: integer("rows_dup").notNull().default(0),
  rowsIgnored: integer("rows_ignored").notNull().default(0),
  rowsReconciled: integer("rows_reconciled").notNull().default(0),
  createdAt: createdAt(),
});

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  destination: text("destination"),
  dateFrom: date("date_from", { mode: "string" }),
  dateTo: date("date_to", { mode: "string" }),
  notes: text("notes"),
  isGeneral: boolean("is_general").notNull().default(false),
  createdAt: createdAt(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateFrom: date("date_from", { mode: "string" }).notNull(),
  dateTo: date("date_to", { mode: "string" }).notNull(),
  status: reportStatusEnum("status").notNull().default("borrador"),
  totalEur: money("total_eur"),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const tripMileage = pgTable("trip_mileage", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  kmTotal: money("km_total").notNull(),
  kmDeduction: money("km_deduction").notNull().default("0"),
  deductionReason: text("deduction_reason"),
  rateEur: money("rate_eur").notNull(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const tripTolls = pgTable("trip_tolls", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  currency: text("currency").notNull(),
  date: date("date", { mode: "string" }),
  note: text("note"),
  fxRate: rate("fx_rate"),
  fxSource: fxSourceEnum("fx_source"),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "set null" }),
    source: sourceEnum("source").notNull(),
    externalId: text("external_id"),
    dedupKey: text("dedup_key").notNull().unique(),
    /** Clave del movimiento pendiente original, cuando se fusionó con su consolidado (RF-28). */
    dedupKeyPrev: text("dedup_key_prev").unique(),
    date: date("date", { mode: "string" }).notNull(),
    merchantNormalized: text("merchant_normalized").notNull(),
    descriptionEnc: text("description_enc"),
    amount: money("amount").notNull(),
    currency: text("currency").notNull(),
    feeAmount: money("fee_amount"),
    feeCurrency: text("fee_currency"),
    feeFxRate: rate("fee_fx_rate"),
    cardLast4: text("card_last4"),
    cardType: cardTypeEnum("card_type"),
    bankStatus: bankStatusEnum("bank_status"),
    kind: kindEnum("kind").notNull().default("gasto"),
    applies: boolean("applies"),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    tripAssignedManually: boolean("trip_assigned_manually").notNull().default(false),
    tripNeedsReview: boolean("trip_needs_review").notNull().default(false),
    surchargePct: numeric("surcharge_pct", { precision: 7, scale: 4 }).notNull().default("0"),
    surchargeEnabled: boolean("surcharge_enabled").notNull().default(false),
    /** Monto debitado en la moneda de la cuenta, si difiere de la moneda original. */
    accountAmount: money("account_amount"),
    accountCurrency: text("account_currency"),
    fxRate: rate("fx_rate"),
    fxSource: fxSourceEnum("fx_source").notNull().default("pendiente"),
    fxDate: date("fx_date", { mode: "string" }),
    amountEur: money("amount_eur"),
    suggestionSource: suggestionSourceEnum("suggestion_source"),
    suggestionConfidence: confidenceEnum("suggestion_confidence"),
    suggestionReason: text("suggestion_reason"),
    suggestedApplies: boolean("suggested_applies"),
    /** Posible pendiente BBVA con el que coincide de forma ambigua (RF-28). */
    possibleMatchId: uuid("possible_match_id"),
    noteEnc: text("note_enc"),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_report_idx").on(t.reportId),
    index("transactions_trip_idx").on(t.tripId),
  ],
);

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchType: matchTypeEnum("match_type").notNull(),
  pattern: text("pattern").notNull(),
  applies: boolean("applies"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  createdFrom: ruleOriginEnum("created_from").notNull().default("manual"),
  hits: integer("hits").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Decisiones de Diego por comercio: alimentan el aprendizaje (RF-35) y el contexto de la IA (§16.7). */
export const merchantDecisions = pgTable(
  "merchant_decisions",
  {
    merchantNormalized: text("merchant_normalized").notNull(),
    applies: boolean("applies").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    count: integer("count").notNull().default(1),
    ruleOffered: boolean("rule_offered").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.merchantNormalized, t.applies] })],
);

export const fxRates = pgTable(
  "fx_rates",
  {
    date: date("date", { mode: "string" }).notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: rate("rate").notNull(),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.base, t.quote] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  meta: jsonb("meta").default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
});

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Trip = typeof trips.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type TripMileage = typeof tripMileage.$inferSelect;
export type TripToll = typeof tripTolls.$inferSelect;
