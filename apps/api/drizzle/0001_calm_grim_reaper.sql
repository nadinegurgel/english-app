DROP INDEX "words_normalized_term_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "words_normalized_term_idx" ON "words" USING btree ("normalized_term");