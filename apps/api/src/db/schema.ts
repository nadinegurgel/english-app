import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const wordSets = pgTable(
  "word_sets",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("word_sets_name_idx").on(table.name)],
);

export const words = pgTable(
  "words",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    setId: integer()
      .notNull()
      .references(() => wordSets.id, { onDelete: "cascade" }),
    term: text().notNull(),
    // Lowercased, trimmed version of the term. A word exists only once across all sets.
    normalizedTerm: text().notNull(),
    meaningPt: text(),
    exampleSentence: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("words_normalized_term_idx").on(table.normalizedTerm)],
);
