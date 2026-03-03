ALTER TABLE "chats" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "compacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "compaction_count" integer DEFAULT 0 NOT NULL;