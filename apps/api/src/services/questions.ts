import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { quizSentenceViews, words } from "../db/schema.js";
import { blankOutTerm, normalizeTerm } from "../lib/normalize.js";
import { getEntries } from "./dictionary.js";
import {
  ensureQuizSentences,
  prepareQuizSentencesInBackground,
  quizSentencesByTerm,
  viewsByWord,
  type QuizSentence,
  type SentenceView,
} from "./quiz-data.js";

// How many of the 3 wrong options may come from the user's own words (the rest come from AI).
const MAX_OWN_DISTRACTORS = 2;

type Word = typeof words.$inferSelect;
type PoolWord = Word & { partOfSpeech: string | null };

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

function pickDistractors(word: PoolWord, aiDistractors: string[], pool: PoolWord[]): string[] {
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

/**
 * The sentence this word has seen least; among equals, the one seen longest ago (never seen comes
 * first). The user's own example sentence is never used as a question.
 */
function chooseSentence(
  sentences: QuizSentence[],
  views: Map<number, SentenceView> | undefined,
  exampleSentence: string | null,
): QuizSentence | undefined {
  const usable = sentences.filter((s) => s.sentence !== exampleSentence);
  const timesUsed = (s: QuizSentence) => views?.get(s.id)?.timesUsed ?? 0;
  const lastUsed = (s: QuizSentence) => views?.get(s.id)?.lastUsedAt?.getTime() ?? 0;
  return shuffle(usable).sort((a, b) => timesUsed(a) - timesUsed(b) || lastUsed(a) - lastUsed(b))[0];
}

/** Builds shuffled multiple-choice questions for the given words, each from a quiz sentence. */
export async function buildQuestions(
  quizWords: Word[],
  log: (error: unknown) => void,
): Promise<Question[]> {
  // Waiting is only needed for terms that have no quiz sentence yet.
  await ensureQuizSentences(quizWords, { onlyEmpty: true });

  const allWords = await db.select().from(words);
  const entries = await getEntries([...new Set(allWords.map((word) => word.normalizedTerm))]);
  const pool: PoolWord[] = allWords.map((word) => ({
    ...word,
    partOfSpeech: entries.get(word.normalizedTerm)?.partOfSpeech ?? null,
  }));
  const ids = new Set(quizWords.map((word) => word.id));
  const fresh = pool.filter((word) => ids.has(word.id));
  const [sentences, views] = await Promise.all([
    quizSentencesByTerm(fresh.map((word) => word.normalizedTerm)),
    viewsByWord([...ids]),
  ]);

  const questions: Question[] = [];
  const seen: { wordId: number; sentenceId: number }[] = [];

  for (const word of fresh) {
    const chosen = chooseSentence(
      sentences.get(word.normalizedTerm) ?? [],
      views.get(word.id),
      word.exampleSentence,
    );
    // Without a quiz sentence (AI off or unavailable), fall back to the example sentence.
    const sentence = chosen?.sentence ?? word.exampleSentence;
    if (!sentence) continue;
    if (chosen) seen.push({ wordId: word.id, sentenceId: chosen.id });

    questions.push({
      wordId: word.id,
      prompt: blankOutTerm(sentence, word.term),
      options: shuffle([word.term, ...pickDistractors(word, chosen?.distractors ?? [], pool)]),
      answer: word.term,
      meaningPt: word.meaningPt,
      sentence,
    });
  }

  if (seen.length) {
    await db
      .insert(quizSentenceViews)
      .values(seen.map((view) => ({ ...view, timesUsed: 1, lastUsedAt: new Date() })))
      .onConflictDoUpdate({
        target: [quizSentenceViews.wordId, quizSentenceViews.sentenceId],
        set: { timesUsed: sql`${quizSentenceViews.timesUsed} + 1`, lastUsedAt: new Date() },
      });
  }
  // Top up terms this word has almost run through, ready for the next quiz.
  prepareQuizSentencesInBackground([...ids], log);

  return shuffle(questions);
}
