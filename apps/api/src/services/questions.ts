import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { words } from "../db/schema.js";
import { blankOutTerm, normalizeTerm } from "../lib/normalize.js";
import { ensureQuizData } from "./quiz-data.js";

// How many of the 3 wrong options may come from the user's own words (the rest come from AI).
const MAX_OWN_DISTRACTORS = 2;

type Word = typeof words.$inferSelect;

export type Question = {
  wordId: number;
  prompt: string;
  options: string[];
  answer: string;
  meaningPt: string | null;
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

function pickDistractors(word: Word, pool: Word[]): string[] {
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
  const samePartOfSpeech = others.filter(
    (other) =>
      word.partOfSpeech &&
      other.partOfSpeech === word.partOfSpeech &&
      formOf(other.term) === formOf(word.term),
  );
  shuffle(samePartOfSpeech)
    .slice(0, MAX_OWN_DISTRACTORS)
    .forEach((other) => add(other.term));
  shuffle(word.distractors ?? []).forEach(add);
  // Without AI distractors, fall back to any of the user's other words.
  shuffle(others).forEach((other) => add(other.term));
  return picked;
}

/** Builds shuffled multiple-choice questions for the given words. */
export async function buildQuestions(quizWords: Word[]): Promise<Question[]> {
  await ensureQuizData(quizWords);

  const ids = quizWords.map((word) => word.id);
  const [fresh, pool] = await Promise.all([
    ids.length ? db.select().from(words).where(inArray(words.id, ids)) : [],
    db.select().from(words),
  ]);

  return shuffle(
    fresh
      .filter((word) => word.exampleSentence)
      .map((word) => ({
        wordId: word.id,
        prompt: blankOutTerm(word.exampleSentence!, word.term),
        options: shuffle([word.term, ...pickDistractors(word, pool)]),
        answer: word.term,
        meaningPt: word.meaningPt,
        sentence: word.exampleSentence!,
      })),
  );
}
