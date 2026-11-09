CREATE TABLE "dictionary_entries" (
	"normalized_term" text PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"meaning_pt" text,
	"part_of_speech" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_example_sentences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dictionary_example_sentences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"normalized_term" text NOT NULL,
	"sentence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_quiz_sentences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dictionary_quiz_sentences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"normalized_term" text NOT NULL,
	"sentence" text NOT NULL,
	"distractors" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_sentence_views" (
	"word_id" integer NOT NULL,
	"sentence_id" integer NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "quiz_sentence_views_word_id_sentence_id_pk" PRIMARY KEY("word_id","sentence_id")
);
--> statement-breakpoint
ALTER TABLE "dictionary_example_sentences" ADD CONSTRAINT "dictionary_example_sentences_normalized_term_dictionary_entries_normalized_term_fk" FOREIGN KEY ("normalized_term") REFERENCES "public"."dictionary_entries"("normalized_term") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_quiz_sentences" ADD CONSTRAINT "dictionary_quiz_sentences_normalized_term_dictionary_entries_normalized_term_fk" FOREIGN KEY ("normalized_term") REFERENCES "public"."dictionary_entries"("normalized_term") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sentence_views" ADD CONSTRAINT "quiz_sentence_views_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sentence_views" ADD CONSTRAINT "quiz_sentence_views_sentence_id_dictionary_quiz_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."dictionary_quiz_sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_example_sentences_term_idx" ON "dictionary_example_sentences" USING btree ("normalized_term");--> statement-breakpoint
CREATE INDEX "dictionary_quiz_sentences_term_idx" ON "dictionary_quiz_sentences" USING btree ("normalized_term");