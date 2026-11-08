CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"daily_new_limit" integer DEFAULT 5 NOT NULL,
	"quiz_mode" text DEFAULT 'one' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_days" (
	"day" date PRIMARY KEY NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "part_of_speech" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "distractors" jsonb;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "stage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "introduced_on" date;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "extra_review_on" date;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "last_reviewed_on" date;--> statement-breakpoint
CREATE INDEX "words_stage_idx" ON "words" USING btree ("stage");