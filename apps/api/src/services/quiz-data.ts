import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { dictionaryEntries, dictionaryQuizSentences, quizSentenceViews, words } from "../db/schema.js";
import { env } from "../env.js";
import { normalizeTerm, sentenceContainsTerm } from "../lib/normalize.js";
import { pickThemes } from "../lib/themes.js";
import { askClaude, isAiEnabled } from "./claude.js";
import { ensureEntries, getEntries, getExampleSentences } from "./dictionary.js";

// Terms per request to Claude.
const BATCH_SIZE = 10;
// Sentences created at a time, until the term reaches QUIZ_SENTENCES_PER_WORD.
const SENTENCES_PER_BATCH = 4;
// When a word has this many unseen sentences or fewer, more are created in the background.
const MIN_UNSEEN_SENTENCES = 1;

const SYSTEM_PROMPT = `You write fill-in-the-blank quiz questions for a Brazilian adult learning English at CEFR level B1.
For each target word or expression you receive, return:
- partOfSpeech: one of "noun", "verb", "adjective", "adverb", "phrasal verb", "expression", "other".
- sentences: one new sentence for each theme listed, in the same order. Each sentence has:
  - sentence: natural, modern English at B1 level, 8 to 18 words, set in its theme.
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
export type QuizSentence = typeof dictionaryQuizSentences.$inferSelect;
export type SentenceView = typeof quizSentenceViews.$inferSelect;

export async function quizSentencesByTerm(normalizedTerms: string[]) {
  const rows = normalizedTerms.length
    ? await db
        .select()
        .from(dictionaryQuizSentences)
        .where(inArray(dictionaryQuizSentences.normalizedTerm, normalizedTerms))
    : [];
  const map = new Map<string, QuizSentence[]>();
  for (const row of rows) {
    map.set(row.normalizedTerm, [...(map.get(row.normalizedTerm) ?? []), row]);
  }
  return map;
}

/** Views per word, keyed by sentence id. */
export async function viewsByWord(wordIds: number[]) {
  const rows = wordIds.length
    ? await db.select().from(quizSentenceViews).where(inArray(quizSentenceViews.wordId, wordIds))
    : [];
  const map = new Map<number, Map<number, SentenceView>>();
  for (const row of rows) {
    const views = map.get(row.wordId) ?? new Map<number, SentenceView>();
    views.set(row.sentenceId, row);
    map.set(row.wordId, views);
  }
  return map;
}

type Target = { term: string; key: string; count: number; avoid: string[] };

async function generateFor(batch: Target[]) {
  const output = await askClaude({
    system: SYSTEM_PROMPT,
    content: batch
      .map((target) => {
        const avoid = target.avoid.map((sentence) => `    - ${sentence}`).join("\n");
        return [
          `- target: ${target.term}`,
          `  themes: ${pickThemes(target.count).join("; ")}`,
          avoid ? `  avoid:\n${avoid}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n"),
    schema: OutputSchema,
  });
  const byTerm = new Map(output.items.map((item) => [normalizeTerm(item.term), item]));

  for (const target of batch) {
    const item = byTerm.get(target.key);
    if (!item) continue;
    const valid = item.sentences
      .map((s) => ({
        sentence: s.sentence.trim(),
        distractors: [...new Set(s.distractors.map((d) => d.trim()).filter(Boolean))].filter(
          (d) => normalizeTerm(d) !== target.key,
        ),
      }))
      // The blank only works if the exact term is in the sentence.
      .filter((s) => sentenceContainsTerm(s.sentence, target.term) && s.distractors.length > 0)
      .slice(0, target.count);

    if (valid.length > 0) {
      await db
        .insert(dictionaryQuizSentences)
        .values(valid.map((s) => ({ normalizedTerm: target.key, ...s })));
    }
    const partOfSpeech = item.partOfSpeech.trim().toLowerCase();
    if (partOfSpeech) {
      await db
        .update(dictionaryEntries)
        .set({ partOfSpeech })
        .where(eq(dictionaryEntries.normalizedTerm, target.key));
    }
  }
}

/**
 * Creates shared quiz sentences with AI for terms whose pool is empty (`onlyEmpty`) or that one of
 * the given words has almost run through. A term never gets more than QUIZ_SENTENCES_PER_WORD.
 * Does nothing when the Claude API is not configured.
 */
export async function ensureQuizSentences(
  candidates: Word[],
  { onlyEmpty = false } = {},
): Promise<void> {
  if (!isAiEnabled || candidates.length === 0) return;
  await ensureEntries(candidates.map((word) => ({ term: word.term })));

  const keys = [...new Set(candidates.map((word) => word.normalizedTerm))];
  const [pools, views, examples, entries] = await Promise.all([
    quizSentencesByTerm(keys),
    viewsByWord(candidates.map((word) => word.id)),
    getExampleSentences(keys),
    getEntries(keys),
  ]);

  const targets = new Map<string, Target>();
  for (const word of candidates) {
    const key = word.normalizedTerm;
    if (targets.has(key)) continue;
    const pool = pools.get(key) ?? [];
    const room = env.QUIZ_SENTENCES_PER_WORD - pool.length;
    if (room <= 0) continue;
    const unseen = pool.filter((s) => !views.get(word.id)?.get(s.id)?.timesUsed).length;
    const needed = onlyEmpty ? pool.length === 0 : unseen <= MIN_UNSEEN_SENTENCES;
    if (!needed) continue;
    targets.set(key, {
      term: entries.get(key)?.term ?? word.term,
      key,
      count: Math.min(SENTENCES_PER_BATCH, room),
      // Quiz sentences must differ from every example sentence, shared or the user's own.
      avoid: [
        ...pool.map((s) => s.sentence),
        ...(examples.get(key) ?? []),
        ...(word.exampleSentence ? [word.exampleSentence] : []),
      ],
    });
  }

  const list = [...targets.values()];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    await generateFor(list.slice(i, i + BATCH_SIZE));
  }
}

/** Runs ensureQuizSentences in the background, so the next quiz opens without waiting. */
export function prepareQuizSentencesInBackground(ids: number[], log: (error: unknown) => void) {
  if (!isAiEnabled || ids.length === 0) return;
  void db
    .select()
    .from(words)
    .where(inArray(words.id, ids))
    .then((rows) => ensureQuizSentences(rows))
    .catch(log);
}
