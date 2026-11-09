CREATE TYPE "public"."currency" AS ENUM('AED', 'USD', 'EUR', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('BILL_OF_LADING', 'AIRWAY_BILL', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'PROOF_OF_DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('PENDING', 'EXTRACTED', 'FAILED', 'REVIEWED');--> statement-breakpoint
CREATE TYPE "public"."hs_status" AS ENUM('UNCLASSIFIED', 'SUGGESTED', 'APPROVED', 'OVERRIDDEN');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('DRAFT', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'CLEARED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."transport_mode" AS ENUM('SEA', 'AIR', 'ROAD');--> statement-breakpoint
CREATE TYPE "public"."classification_decision" AS ENUM('APPROVED', 'OVERRIDDEN');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."milestone_kind" AS ENUM('BOOKING', 'CUSTOMS_CLEARED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('PENDING', 'LOCKED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('SIMULATED', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."tax_treatment" AS ENUM('STANDARD', 'ZERO_RATED', 'EXEMPT');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"document_number" text,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"extraction_status" "extraction_status" DEFAULT 'PENDING' NOT NULL,
	"extracted" jsonb,
	"stated_total" numeric(14, 2),
	"computed_total" numeric(14, 2),
	"has_discrepancy" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_shipment_sha_uq" UNIQUE("shipment_id","sha256"),
	CONSTRAINT "documents_mime_chk" CHECK ("documents"."mime_type" in ('application/pdf', 'image/png', 'image/jpeg')),
	CONSTRAINT "documents_size_chk" CHECK ("documents"."size_bytes" > 0 and "documents"."size_bytes" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"document_id" uuid,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"weight_kg" numeric(12, 3),
	"volume_cbm" numeric(12, 3),
	"hs_code" text,
	"hs_status" "hs_status" DEFAULT 'UNCLASSIFIED' NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_items_shipment_line_uq" UNIQUE("shipment_id","line_no"),
	CONSTRAINT "line_items_qty_positive" CHECK ("line_items"."quantity" > 0),
	CONSTRAINT "line_items_price_nonneg" CHECK ("line_items"."unit_price" >= 0),
	CONSTRAINT "line_items_hs_format" CHECK ("line_items"."hs_code" is null or "line_items"."hs_code" ~ '^[0-9]{6,8}$')
);
--> statement-breakpoint
ALTER TABLE "line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_number" text NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"shipper_name" text NOT NULL,
	"shipper_trn" text,
	"consignee_name" text NOT NULL,
	"consignee_trn" text,
	"carrier_name" text NOT NULL,
	"origin_port" text NOT NULL,
	"destination_port" text NOT NULL,
	"free_zone" boolean DEFAULT false NOT NULL,
	"status" "shipment_status" DEFAULT 'DRAFT' NOT NULL,
	"freight_amount" numeric(14, 2) NOT NULL,
	"freight_currency" "currency" DEFAULT 'AED' NOT NULL,
	"etd" timestamp with time zone,
	"eta" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_trackingNumber_unique" UNIQUE("tracking_number"),
	CONSTRAINT "shipments_locode_chk" CHECK ("shipments"."origin_port" ~ '^[A-Z]{5}$' and "shipments"."destination_port" ~ '^[A-Z]{5}$'),
	CONSTRAINT "shipments_trn_chk" CHECK (("shipments"."shipper_trn" is null or "shipments"."shipper_trn" ~ '^[0-9]{15}$') and ("shipments"."consignee_trn" is null or "shipments"."consignee_trn" ~ '^[0-9]{15}$')),
	CONSTRAINT "shipments_freight_positive" CHECK ("shipments"."freight_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_item_id" uuid NOT NULL,
	"suggested_code" text,
	"chosen_code" text NOT NULL,
	"confidence" numeric(5, 4),
	"decision" "classification_decision" NOT NULL,
	"note" text,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_confidence_range" CHECK ("classification_decisions"."confidence" is null or "classification_decisions"."confidence" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "classification_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hs_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"chapter" integer NOT NULL,
	"duty_rate_bp" integer NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"embedding" vector(384),
	CONSTRAINT "hs_codes_format" CHECK ("hs_codes"."code" ~ '^[0-9]{6}$'),
	CONSTRAINT "hs_codes_duty_range" CHECK ("hs_codes"."duty_rate_bp" between 0 and 50000)
);
--> statement-breakpoint
ALTER TABLE "hs_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounts" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "escrow_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"kind" "milestone_kind" NOT NULL,
	"percent_bp" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"status" "milestone_status" DEFAULT 'PENDING' NOT NULL,
	"ledger_transaction_id" uuid,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_shipment_kind_uq" UNIQUE("shipment_id","kind"),
	CONSTRAINT "escrow_percent_range" CHECK ("escrow_milestones"."percent_bp" > 0 and "escrow_milestones"."percent_bp" <= 10000),
	CONSTRAINT "escrow_released_consistent" CHECK (("escrow_milestones"."status" = 'RELEASED') = ("escrow_milestones"."released_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "escrow_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"currency" "currency" NOT NULL,
	"rate_to_aed" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_currency_asof_uq" UNIQUE("currency","as_of"),
	CONSTRAINT "fx_rates_positive" CHECK ("fx_rates"."rate_to_aed" > 0)
);
--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"tax_treatment" "tax_treatment" NOT NULL,
	"currency" "currency" NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"duty_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"fx_rate_to_aed" numeric(18, 8) NOT NULL,
	"total_aed" numeric(14, 2) NOT NULL,
	"idempotency_key" text NOT NULL,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "invoices_total_consistent" CHECK ("invoices"."total" = "invoices"."subtotal" + "invoices"."vat_amount" + "invoices"."duty_amount"),
	CONSTRAINT "invoices_vat_rate" CHECK ("invoices"."vat_rate_bp" in (0, 500)),
	CONSTRAINT "invoices_treatment_rate" CHECK (("invoices"."tax_treatment" = 'STANDARD') = ("invoices"."vat_rate_bp" = 500)),
	CONSTRAINT "invoices_nonneg" CHECK ("invoices"."subtotal" >= 0 and "invoices"."vat_amount" >= 0 and "invoices"."duty_amount" >= 0),
	CONSTRAINT "invoices_fx_positive" CHECK ("invoices"."fx_rate_to_aed" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"fx_rate_to_aed" numeric(18, 8) NOT NULL,
	"amount_aed" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount" > 0 and "ledger_entries"."amount_aed" > 0),
	CONSTRAINT "ledger_entries_fx_positive" CHECK ("ledger_entries"."fx_rate_to_aed" > 0),
	CONSTRAINT "ledger_entries_aed_rate" CHECK ("ledger_entries"."currency" <> 'AED' or "ledger_entries"."fx_rate_to_aed" = 1)
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"shipment_id" uuid,
	"invoice_id" uuid,
	"idempotency_key" text NOT NULL,
	"reverses_id" uuid,
	"posted_by" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "ledger_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"milestone_id" uuid NOT NULL,
	"carrier_name" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"status" "payout_status" DEFAULT 'SIMULATED' NOT NULL,
	"external_ref" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_decisions" ADD CONSTRAINT "classification_decisions_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_decisions" ADD CONSTRAINT "classification_decisions_chosen_code_hs_codes_code_fk" FOREIGN KEY ("chosen_code") REFERENCES "public"."hs_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_decisions" ADD CONSTRAINT "classification_decisions_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_milestones" ADD CONSTRAINT "escrow_milestones_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_milestones" ADD CONSTRAINT "escrow_milestones_ledger_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("ledger_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_milestones" ADD CONSTRAINT "escrow_milestones_released_by_profiles_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_code_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_posted_by_profiles_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_milestone_id_escrow_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."escrow_milestones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_shipment_idx" ON "documents" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "line_items_hs_idx" ON "line_items" USING btree ("hs_code");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "classification_line_item_idx" ON "classification_decisions" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "hs_codes_embedding_hnsw" ON "hs_codes" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "invoices_shipment_idx" ON "invoices" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_code");--> statement-breakpoint
CREATE INDEX "ledger_tx_shipment_idx" ON "ledger_transactions" USING btree ("shipment_id");--> statement-breakpoint
CREATE POLICY "documents_select" ON "documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "documents_insert" ON "documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select public.current_user_role()) in ('coordinator'));--> statement-breakpoint
CREATE POLICY "line_items_select" ON "line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "line_items_insert" ON "line_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select public.current_user_role()) in ('coordinator'));--> statement-breakpoint
CREATE POLICY "line_items_update" ON "line_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker')) WITH CHECK ((select public.current_user_role()) in ('coordinator', 'broker'));--> statement-breakpoint
CREATE POLICY "shipments_select" ON "shipments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "shipments_insert" ON "shipments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select public.current_user_role()) in ('coordinator'));--> statement-breakpoint
CREATE POLICY "shipments_update" ON "shipments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker')) WITH CHECK ((select public.current_user_role()) in ('coordinator', 'broker'));--> statement-breakpoint
CREATE POLICY "classification_select" ON "classification_decisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "classification_insert" ON "classification_decisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((select public.current_user_role()) in ('broker'));--> statement-breakpoint
CREATE POLICY "hs_codes_select" ON "hs_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "accounts_select" ON "accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "audit_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('finance'));--> statement-breakpoint
CREATE POLICY "escrow_select" ON "escrow_milestones" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "fx_rates_select" ON "fx_rates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "invoices_select" ON "invoices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('coordinator', 'broker', 'finance'));--> statement-breakpoint
CREATE POLICY "ledger_entries_select" ON "ledger_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('finance'));--> statement-breakpoint
CREATE POLICY "ledger_tx_select" ON "ledger_transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('finance'));--> statement-breakpoint
CREATE POLICY "payouts_select" ON "payouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select public.current_user_role()) in ('finance'));