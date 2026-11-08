CREATE TABLE "word_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "word_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "words_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"set_id" integer NOT NULL,
	"term" text NOT NULL,
	"normalized_term" text NOT NULL,
	"meaning_pt" text,
	"example_sentence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_set_id_word_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."word_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "word_sets_name_idx" ON "word_sets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "words_normalized_term_idx" ON "words" USING btree ("normalized_term");