ALTER TABLE "line_items" ADD COLUMN "hs_confidence" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "hs_codes" ADD COLUMN "heading" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hs_codes" ADD COLUMN "section" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hs_codes" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', "hs_codes"."description"), 'A') || setweight(to_tsvector('english', "hs_codes"."heading"), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "hs_codes_search_gin" ON "hs_codes" USING gin ("search");