import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { quizSentences, words } from "../db/schema.js";
import { normalizeTerm, sentenceContainsTerm } from "../lib/normalize.js";
import { askClaude, isAiEnabled } from "./claude.js";

// Words per request to Claude.
const BATCH_SIZE = 10;
// Sentences created the first time, and each time all of a word's sentences have been used.
const SENTENCES_PER_BATCH = 4;
// When a word has this many unused sentences or fewer, more are created in the background.
const MIN_UNUSED_SENTENCES = 1;
// After this many sentences, the quiz rotates the existing ones instead of creating more.
const MAX_SENTENCES_PER_WORD = 16;

const SYSTEM_PROMPT = `You write fill-in-the-blank quiz questions for a Brazilian university student learning English at CEFR level B1.
For each target word or expression you receive, return:
- partOfSpeech: one of "noun", "verb", "adjective", "adverb", "phrasal verb", "expression", "other".
- sentences: the requested number of new sentences. Each sentence has:
  - sentence: natural, modern English at B1 level, 8 to 18 words, set in everyday life or university life.
  - distractors: exactly 3 wrong answers for the blank in that sentence.

Rules for sentences:
- Contain the target exactly as given (same spelling and form), because it will be blanked out.
- The context must make the meaning clear enough to guess the missing word.
- Every sentence uses a different situation, and none repeats or paraphrases the sentences listed under "avoid".
- No names of real people or brands.

Rules for distractors:
- Same part of speech and the same grammatical form as the target, so grammar alone does not reveal the answer.
- Similar difficulty, plausible at first glance, but clearly wrong for the meaning of that sentence.
- Never the target itself, a synonym of it, or another word that would also make the sentence correct.`;

const OutputSchema = z.object({
  items: z.array(
    z.object({
      term: z.string(),
      partOfSpeech: z.string(),
      sentences: z.array(z.object({ sentence: z.string(), distractors: z.array(z.string()) })),
    }),
  ),
});

type Word = typeof words.$inferSelect;

export async function sentencesByWord(wordIds: number[]) {
  const rows = wordIds.length
    ? await db.select().from(quizSentences).where(inArray(quizSentences.wordId, wordIds))
    : [];
  const map = new Map<number, (typeof quizSentences.$inferSelect)[]>();
  for (const row of rows) map.set(row.wordId, [...(map.get(row.wordId) ?? []), row]);
  return map;
}

async function generateFor(batch: Word[], existing: Map<number, { sentence: string }[]>) {
  const output = await askClaude({
    system: SYSTEM_PROMPT,
    content: batch
      .map((word) => {
        const avoid = [word.exampleSentence, ...(existing.get(word.id) ?? []).map((s) => s.sentence)]
          .filter(Boolean)
          .map((sentence) => `    - ${sentence}`)
          .join("\n");
        return [
          `- target: ${word.term}`,
          word.meaningPt ? `  meaning in Portuguese: ${word.meaningPt}` : null,
          `  sentences to write: ${SENTENCES_PER_BATCH}`,
          avoid ? `  avoid:\n${avoid}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n"),
    schema: OutputSchema,
  });
  const byTerm = new Map(output.items.map((item) => [normalizeTerm(item.term), item]));

  for (const word of batch) {
    const item = byTerm.get(normalizeTerm(word.term));
    if (!item) continue;
    const valid = item.sentences
      .map((s) => ({
        sentence: s.sentence.trim(),
        distractors: [...new Set(s.distractors.map((d) => d.trim()).filter(Boolean))].filter(
          (d) => normalizeTerm(d) !== normalizeTerm(word.term),
        ),
      }))
      // The blank only works if the exact term is in the sentence.
      .filter((s) => sentenceContainsTerm(s.sentence, word.term) && s.distractors.length > 0);

    if (valid.length > 0) {
      await db.insert(quizSentences).values(valid.map((s) => ({ wordId: word.id, ...s })));
    }
    await db
      .update(words)
      .set({ partOfSpeech: item.partOfSpeech.trim().toLowerCase() })
      .where(eq(words.id, word.id));
  }
}

/**
 * Creates quiz sentences with AI for words that are running out of unused sentences (or, with
 * `onlyEmpty`, have no sentence at all). Does nothing when the Claude API is not configured.
 */
export async function ensureQuizSentences(
  candidates: Word[],
  { onlyEmpty = false } = {},
): Promise<void> {
  if (!isAiEnabled) return;
  const existing = await sentencesByWord(candidates.map((word) => word.id));
  const needing = candidates.filter((word) => {
    const list = existing.get(word.id) ?? [];
    if (onlyEmpty) return list.length === 0;
    // Top up while one unused sentence is still left, so the next quiz never has to wait.
    const unused = list.filter((s) => s.timesUsed === 0).length;
    return list.length < MAX_SENTENCES_PER_WORD && unused <= MIN_UNUSED_SENTENCES;
  });

  for (let i = 0; i < needing.length; i += BATCH_SIZE) {
    await generateFor(needing.slice(i, i + BATCH_SIZE), existing);
  }
}

/** Runs ensureQuizSentences in the background, so the next quiz opens without waiting. */
export function prepareQuizSentencesInBackground(ids: number[], log: (error: unknown) => void) {
  if (!isAiEnabled || ids.length === 0) return;
  void db
    .select()
    .from(words)
    .where(inArray(words.id, ids))
    .then(ensureQuizSentences)
    .catch(log);
}

/** Removes a word's quiz sentences, for example after its term changes. */
export async function resetQuizSentences(wordId: number): Promise<void> {
  await db.delete(quizSentences).where(eq(quizSentences.wordId, wordId));
  await db.update(words).set({ partOfSpeech: null }).where(eq(words.id, wordId));
}

