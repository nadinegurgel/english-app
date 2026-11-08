import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { words } from "../db/schema.js";
import { normalizeTerm } from "../lib/normalize.js";
import { askClaude, isAiEnabled } from "./claude.js";

const BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You prepare multiple-choice fill-in-the-blank questions for a B1 English learner.
Each item has a target word or expression and a sentence that uses it.
For each item return:
- partOfSpeech: one of "noun", "verb", "adjective", "adverb", "phrasal verb", "expression", "other", describing how the target is used in the sentence.
- distractors: exactly 3 English words or expressions that would be wrong answers for the blank.

Rules for distractors:
- Same part of speech and the same grammatical form as the target in the sentence, so grammar alone does not reveal the answer.
- Similar difficulty (B1), plausible at first glance, but clearly wrong for the meaning of the sentence.
- Never the target itself, a synonym of it, or another word that would also make the sentence correct.
Return the items in the same order you received them.`;

const QuizDataSchema = z.object({
  items: z.array(
    z.object({
      term: z.string(),
      partOfSpeech: z.string(),
      distractors: z.array(z.string()),
    }),
  ),
});

type QuizWord = { id: number; term: string; exampleSentence: string | null; distractors: unknown };

/**
 * Generates and stores part of speech and AI distractors for words that do not have them yet.
 * Does nothing when the Claude API is not configured; the quiz then uses the user's own words.
 */
export async function ensureQuizData(candidates: QuizWord[]): Promise<void> {
  if (!isAiEnabled) return;
  const missing = candidates.filter((word) => word.exampleSentence && !word.distractors);

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const output = await askClaude({
      system: SYSTEM_PROMPT,
      content: batch
        .map((word) => `- target: ${word.term}\n  sentence: ${word.exampleSentence}`)
        .join("\n"),
      schema: QuizDataSchema,
    });
    const byTerm = new Map(output.items.map((item) => [normalizeTerm(item.term), item]));

    for (const word of batch) {
      const item = byTerm.get(normalizeTerm(word.term));
      if (!item) continue;
      const distractors = [
        ...new Set(item.distractors.map((d) => d.trim()).filter(Boolean)),
      ].filter((d) => normalizeTerm(d) !== normalizeTerm(word.term));
      await db
        .update(words)
        .set({ partOfSpeech: item.partOfSpeech.trim().toLowerCase(), distractors })
        .where(eq(words.id, word.id));
    }
  }
}

/** Runs ensureQuizData in the background after words are saved, so the first quiz is fast. */
export function prepareQuizDataInBackground(ids: number[], log: (error: unknown) => void) {
  if (!isAiEnabled || ids.length === 0) return;
  void db
    .select()
    .from(words)
    .where(inArray(words.id, ids))
    .then(ensureQuizData)
    .catch(log);
}
