CREATE TABLE "quiz_sentences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_sentences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"word_id" integer NOT NULL,
	"sentence" text NOT NULL,
	"distractors" jsonb NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_sentences" ADD CONSTRAINT "quiz_sentences_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_sentences_word_id_idx" ON "quiz_sentences" USING btree ("word_id");--> statement-breakpoint
ALTER TABLE "words" DROP COLUMN "distractors";