CREATE TYPE "public"."bank_status" AS ENUM('pendiente', 'consolidado');--> statement-breakpoint
CREATE TYPE "public"."card_type" AS ENUM('fisica', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('alta', 'media', 'baja');--> statement-breakpoint
CREATE TYPE "public"."fx_source" AS ENUM('wise', 'bbva', 'ecb', 'manual', 'eur', 'pendiente');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('wise', 'bbva');--> statement-breakpoint
CREATE TYPE "public"."tx_kind" AS ENUM('gasto', 'no_gasto');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('merchant_equals', 'merchant_contains', 'regex');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('borrador', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."rule_origin" AS ENUM('manual', 'aprendida');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('wise', 'bbva', 'manual');--> statement-breakpoint
CREATE TYPE "public"."suggestion_source" AS ENUM('regla', 'tarjeta', 'ia');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(20, 10) NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "fx_rates_date_base_quote_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE "import_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "import_source" NOT NULL,
	"header_signature" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_profiles_header_signature_unique" UNIQUE("header_signature")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "import_source" NOT NULL,
	"file_sha256" text NOT NULL,
	"date_from" date,
	"date_to" date,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_new" integer DEFAULT 0 NOT NULL,
	"rows_dup" integer DEFAULT 0 NOT NULL,
	"rows_ignored" integer DEFAULT 0 NOT NULL,
	"rows_reconciled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_file_sha256_unique" UNIQUE("file_sha256")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_decisions" (
	"merchant_normalized" text NOT NULL,
	"applies" boolean NOT NULL,
	"category_id" uuid,
	"count" integer DEFAULT 1 NOT NULL,
	"rule_offered" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_decisions_merchant_normalized_applies_pk" PRIMARY KEY("merchant_normalized","applies")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"status" "report_status" DEFAULT 'borrador' NOT NULL,
	"total_eur" numeric(14, 4),
	"email_subject" text,
	"email_body" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_type" "match_type" NOT NULL,
	"pattern" text NOT NULL,
	"applies" boolean,
	"category_id" uuid,
	"created_from" "rule_origin" DEFAULT 'manual' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid,
	"source" "source" NOT NULL,
	"external_id" text,
	"dedup_key" text NOT NULL,
	"dedup_key_prev" text,
	"date" date NOT NULL,
	"merchant_normalized" text NOT NULL,
	"description_enc" text,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text NOT NULL,
	"fee_amount" numeric(14, 4),
	"fee_currency" text,
	"fee_fx_rate" numeric(20, 10),
	"card_last4" text,
	"card_type" "card_type",
	"bank_status" "bank_status",
	"kind" "tx_kind" DEFAULT 'gasto' NOT NULL,
	"applies" boolean,
	"trip_id" uuid,
	"category_id" uuid,
	"trip_assigned_manually" boolean DEFAULT false NOT NULL,
	"trip_needs_review" boolean DEFAULT false NOT NULL,
	"surcharge_pct" numeric(7, 4) DEFAULT '0' NOT NULL,
	"surcharge_enabled" boolean DEFAULT false NOT NULL,
	"account_amount" numeric(14, 4),
	"account_currency" text,
	"fx_rate" numeric(20, 10),
	"fx_source" "fx_source" DEFAULT 'pendiente' NOT NULL,
	"fx_date" date,
	"amount_eur" numeric(14, 4),
	"suggestion_source" "suggestion_source",
	"suggestion_confidence" "confidence",
	"suggestion_reason" text,
	"suggested_applies" boolean,
	"possible_match_id" uuid,
	"note_enc" text,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_dedup_key_unique" UNIQUE("dedup_key"),
	CONSTRAINT "transactions_dedup_key_prev_unique" UNIQUE("dedup_key_prev")
);
--> statement-breakpoint
CREATE TABLE "trip_mileage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"km_total" numeric(14, 4) NOT NULL,
	"km_deduction" numeric(14, 4) DEFAULT '0' NOT NULL,
	"deduction_reason" text,
	"rate_eur" numeric(14, 4) NOT NULL,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_tolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text NOT NULL,
	"date" date,
	"note" text,
	"fx_rate" numeric(20, 10),
	"fx_source" "fx_source",
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"destination" text,
	"date_from" date,
	"date_to" date,
	"notes" text,
	"is_general" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "merchant_decisions" ADD CONSTRAINT "merchant_decisions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_mileage" ADD CONSTRAINT "trip_mileage_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_mileage" ADD CONSTRAINT "trip_mileage_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_tolls" ADD CONSTRAINT "trip_tolls_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_tolls" ADD CONSTRAINT "trip_tolls_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_user_idx" ON "login_attempts" USING btree ("username","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_report_idx" ON "transactions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "transactions_trip_idx" ON "transactions" USING btree ("trip_id");