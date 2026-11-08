import { inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { quizSentences, words } from "../db/schema.js";
import { blankOutTerm, normalizeTerm } from "../lib/normalize.js";
import {
  ensureQuizSentences,
  prepareQuizSentencesInBackground,
  sentencesByWord,
} from "./quiz-data.js";

// How many of the 3 wrong options may come from the user's own words (the rest come from AI).
const MAX_OWN_DISTRACTORS = 2;

type Word = typeof words.$inferSelect;
type QuizSentence = typeof quizSentences.$inferSelect;

export type Question = {
  wordId: number;
  prompt: string;
  options: string[];
  answer: string;
  meaningPt: string | null;
  // The quiz sentence with the term filled in, shown after answering.
  sentence: string;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Rough grammatical form of the last word ("ing", "ed", "s" or "base"). The user's own words are
 * only used as options when the form matches, so "scoff" is not offered where "stomping" fits.
 */
function formOf(term: string): string {
  const last = normalizeTerm(term).split(" ").at(-1) ?? "";
  if (last.endsWith("ing")) return "ing";
  if (last.endsWith("ed")) return "ed";
  if (last.endsWith("s") && !last.endsWith("ss")) return "s";
  return "base";
}

function pickDistractors(word: Word, aiDistractors: string[], pool: Word[]): string[] {
  const picked: string[] = [];
  const used = new Set([normalizeTerm(word.term)]);
  const add = (term: string) => {
    const key = normalizeTerm(term);
    if (picked.length < 3 && !used.has(key)) {
      used.add(key);
      picked.push(term);
    }
  };

  const others = pool.filter((other) => other.id !== word.id);
  const sameKind = others.filter(
    (other) =>
      word.partOfSpeech &&
      other.partOfSpeech === word.partOfSpeech &&
      formOf(other.term) === formOf(word.term),
  );
  shuffle(sameKind)
    .slice(0, MAX_OWN_DISTRACTORS)
    .forEach((other) => add(other.term));
  shuffle(aiDistractors).forEach(add);
  // Without AI distractors, fall back to any of the user's other words.
  shuffle(others).forEach((other) => add(other.term));
  return picked;
}

/** The least used sentence; among equals, the one used longest ago (never used comes first). */
function chooseSentence(sentences: QuizSentence[]): QuizSentence | undefined {
  return shuffle(sentences).sort(
    (a, b) =>
      a.timesUsed - b.timesUsed ||
      (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0),
  )[0];
}

/** Builds shuffled multiple-choice questions for the given words, each from a quiz sentence. */
export async function buildQuestions(
  quizWords: Word[],
  log: (error: unknown) => void,
): Promise<Question[]> {
  // Waiting is only needed for words that have no quiz sentence yet.
  await ensureQuizSentences(quizWords, { onlyEmpty: true });

  const ids = quizWords.map((word) => word.id);
  const [fresh, pool, sentences] = await Promise.all([
    ids.length ? db.select().from(words).where(inArray(words.id, ids)) : [],
    db.select().from(words),
    sentencesByWord(ids),
  ]);

  const questions: Question[] = [];
  const usedSentenceIds: number[] = [];

  for (const word of fresh) {
    const chosen = chooseSentence(sentences.get(word.id) ?? []);
    // Without a quiz sentence (AI off or unavailable), fall back to the example sentence.
    const sentence = chosen?.sentence ?? word.exampleSentence;
    if (!sentence) continue;
    if (chosen) usedSentenceIds.push(chosen.id);

    questions.push({
      wordId: word.id,
      prompt: blankOutTerm(sentence, word.term),
      options: shuffle([word.term, ...pickDistractors(word, chosen?.distractors ?? [], pool)]),
      answer: word.term,
      meaningPt: word.meaningPt,
      sentence,
    });
  }

  if (usedSentenceIds.length) {
    await db
      .update(quizSentences)
      .set({ timesUsed: sql`${quizSentences.timesUsed} + 1`, lastUsedAt: new Date() })
      .where(inArray(quizSentences.id, usedSentenceIds));
  }
  // Top up words that just used their last new sentence, ready for the next quiz.
  prepareQuizSentencesInBackground(ids, log);

  return shuffle(questions);
}
