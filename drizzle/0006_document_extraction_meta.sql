ALTER TABLE "documents" ADD COLUMN "extraction_provider" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;