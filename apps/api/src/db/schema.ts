import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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


    // Spaced repetition. Stage counts the scheduled steps already done:
    // 0 = new, 1 = Day 1 done (next: Day 3), 2 = Day 3 done (next: Day 7), 3 = learned.
    stage: integer().notNull().default(0),
    introducedOn: date({ mode: "string" }),
    dueOn: date({ mode: "string" }),
    // Set to the next day after a wrong answer, independent of the regular schedule.
    extraReviewOn: date({ mode: "string" }),
    lastReviewedOn: date({ mode: "string" }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("words_normalized_term_idx").on(table.normalizedTerm),
    index("words_stage_idx").on(table.stage),
  ],
);

// Shared dictionary, keyed by normalized term and reused by every user. It only holds what the AI
// generated; a user's own meaning and example sentence live on their word.
export const dictionaryEntries = pgTable("dictionary_entries", {
  normalizedTerm: text().primaryKey(),
  term: text().notNull(),
  meaningPt: text(),
  partOfSpeech: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Example sentences offered by "Gerar frase", up to EXAMPLE_SENTENCES_PER_WORD per term.
export const dictionaryExampleSentences = pgTable(
  "dictionary_example_sentences",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    normalizedTerm: text()
      .notNull()
      .references(() => dictionaryEntries.normalizedTerm, { onDelete: "cascade" }),
    sentence: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("dictionary_example_sentences_term_idx").on(table.normalizedTerm)],
);

// Quiz sentences, up to QUIZ_SENTENCES_PER_WORD per term, each with its own AI distractors.
// They are never shown as example sentences.
export const dictionaryQuizSentences = pgTable(
  "dictionary_quiz_sentences",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    normalizedTerm: text()
      .notNull()
      .references(() => dictionaryEntries.normalizedTerm, { onDelete: "cascade" }),
    sentence: text().notNull(),
    distractors: jsonb().$type<string[]>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("dictionary_quiz_sentences_term_idx").on(table.normalizedTerm)],
);

// How often each word (and so each user) has seen each quiz sentence, for rotation.
export const quizSentenceViews = pgTable(
  "quiz_sentence_views",
  {
    wordId: integer()
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    sentenceId: integer()
      .notNull()
      .references(() => dictionaryQuizSentences.id, { onDelete: "cascade" }),
    timesUsed: integer().notNull().default(0),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.wordId, table.sentenceId] })],
);

// "studied": the whole daily quiz was finished. "rest": the app was opened and nothing was due,
// which keeps the streak alive without adding to it.
export const studyDays = pgTable("study_days", {
  day: date({ mode: "string" }).primaryKey(),
  kind: text().$type<"studied" | "rest">().notNull().default("studied"),
  completedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Single-row table (id is always 1).
export const settings = pgTable("settings", {
  id: integer().primaryKey().default(1),
  dailyNewLimit: integer().notNull().default(5),
  quizMode: text().$type<"one" | "all">().notNull().default("one"),
});
