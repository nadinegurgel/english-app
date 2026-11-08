import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { wordSets, words } from "../db/schema.js";
import { HttpError } from "../lib/http-errors.js";
import { normalizeTerm, sentenceContainsTerm } from "../lib/normalize.js";
import { ensureEntries } from "../services/dictionary.js";
import { prepareQuizSentencesInBackground } from "../services/quiz-data.js";
import { suggestExamples, suggestRelatedWords } from "../services/suggestions.js";

const termSchema = z.string().trim().min(1).max(100);
const meaningSchema = z.string().trim().max(200);
const sentenceSchema = z.string().trim().max(300);

const termList = z.array(termSchema).min(1).max(200);

const checkBody = z.object({ terms: termList });

const suggestionsBody = z.object({
  items: z
    .array(z.object({ term: termSchema, seen: z.array(sentenceSchema).max(50).default([]) }))
    .min(1)
    .max(50),
});

const saveBody = z.object({
  setId: z.number().int().positive(),
  words: z
    .array(
      z.object({
        term: termSchema,
        meaningPt: meaningSchema.optional(),
        exampleSentence: sentenceSchema.optional(),
      }),
    )
    .min(1)
    .max(200),
});

const relatedBody = z.object({
  setId: z.number().int().positive().optional(),
  // Words in the preview that are not saved yet.
  terms: z.array(termSchema).max(200),
  // Suggestions already shown, so "more suggestions" brings new ones.
  exclude: z.array(termSchema).max(300).default([]),
});

const RELATED_COUNT = 5;

const idParams = z.object({ id: z.coerce.number().int().positive() });

const updateBody = z.object({
  term: termSchema,
  meaningPt: meaningSchema,
  exampleSentence: sentenceSchema,
});

function assertSentenceHasTerm(sentence: string | undefined, term: string) {
  if (sentence && !sentenceContainsTerm(sentence, term)) {
    throw new HttpError(400, `The example sentence must contain "${term}".`);
  }
}

async function findExisting(normalizedTerms: string[]) {
  if (normalizedTerms.length === 0) return new Map<string, { id: number; setName: string }>();
  const rows = await db
    .select({ id: words.id, normalizedTerm: words.normalizedTerm, setName: wordSets.name })
    .from(words)
    .innerJoin(wordSets, eq(words.setId, wordSets.id))
    .where(inArray(words.normalizedTerm, normalizedTerms));
  return new Map(rows.map((row) => [row.normalizedTerm, { id: row.id, setName: row.setName }]));
}

export async function wordRoutes(app: FastifyInstance) {
  app.get("/api/words", async () => {
    return db
      .select({
        id: words.id,
        setId: words.setId,
        term: words.term,
        meaningPt: words.meaningPt,
        exampleSentence: words.exampleSentence,
      })
      .from(words)
      .orderBy(asc(words.normalizedTerm));
  });

  app.post("/api/words/check", async (request) => {
    const { terms } = checkBody.parse(request.body);
    const existing = await findExisting(terms.map(normalizeTerm));
    return terms.map((term) => ({
      term,
      existing: existing.get(normalizeTerm(term)) ?? null,
    }));
  });

  app.post("/api/words/suggestions", async (request) => {
    const { items } = suggestionsBody.parse(request.body);
    return suggestExamples(items);
  });

  app.post("/api/words/related", async (request) => {
    const body = relatedBody.parse(request.body);
    const setWords = body.setId
      ? await db.select({ term: words.term }).from(words).where(eq(words.setId, body.setId))
      : [];
    const setTerms = [...setWords.map((word) => word.term), ...body.terms];
    if (setTerms.length === 0) return [];

    // Words saved in any set are never suggested again.
    const saved = await db.select({ term: words.term }).from(words);
    return suggestRelatedWords(
      setTerms,
      [...body.exclude, ...saved.map((word) => word.term)],
      RELATED_COUNT,
    );
  });

  app.post("/api/words", async (request, reply) => {
    const body = saveBody.parse(request.body);
    body.words.forEach((word) => assertSentenceHasTerm(word.exampleSentence, word.term));

    const set = await db.query.wordSets.findFirst({ where: eq(wordSets.id, body.setId) });
    if (!set) {
      throw new HttpError(404, "Set not found.");
    }

    const unique = new Map(body.words.map((word) => [normalizeTerm(word.term), word]));
    const existing = await findExisting([...unique.keys()]);
    const toInsert = [...unique.entries()]
      .filter(([normalized]) => !existing.has(normalized))
      .map(([normalizedTerm, word]) => ({
        setId: set.id,
        term: word.term.replace(/\s+/g, " "),
        normalizedTerm,
        meaningPt: word.meaningPt || null,
        exampleSentence: word.exampleSentence || null,
      }));

    await ensureEntries(toInsert.map((word) => ({ term: word.term })));
    const created = toInsert.length
      ? await db.insert(words).values(toInsert).onConflictDoNothing().returning()
      : [];
    prepareQuizSentencesInBackground(
      created.map((word) => word.id),
      (error) => request.log.error(error),
    );

    return reply.code(201).send({
      created: created.length,
      skipped: body.words.length - created.length,
    });
  });

  app.put("/api/words/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    assertSentenceHasTerm(body.exampleSentence, body.term);

    const normalizedTerm = normalizeTerm(body.term);
    const duplicate = await db.query.words.findFirst({
      where: and(eq(words.normalizedTerm, normalizedTerm), ne(words.id, id)),
    });
    if (duplicate) {
      throw new HttpError(409, "Another word with this spelling already exists.");
    }

    const current = await db.query.words.findFirst({ where: eq(words.id, id) });
    if (!current) {
      throw new HttpError(404, "Word not found.");
    }
    // A new term has its own shared dictionary entry and quiz sentences.
    const termChanged = current.normalizedTerm !== normalizedTerm;

    const [updated] = await db
      .update(words)
      .set({
        term: body.term.replace(/\s+/g, " "),
        normalizedTerm,
        meaningPt: body.meaningPt || null,
        exampleSentence: body.exampleSentence || null,
        updatedAt: new Date(),
      })
      .where(eq(words.id, id))
      .returning({
        id: words.id,
        setId: words.setId,
        term: words.term,
        meaningPt: words.meaningPt,
        exampleSentence: words.exampleSentence,
      });
    if (!updated) {
      throw new HttpError(404, "Word not found.");
    }
    if (termChanged) {
      // The new term has its own shared quiz sentences; make sure they exist.
      await ensureEntries([{ term: updated.term }]);
      prepareQuizSentencesInBackground([updated.id], (error) => request.log.error(error));
    }
    return updated;
  });

  app.delete("/api/words/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const deleted = await db.delete(words).where(eq(words.id, id)).returning({ id: words.id });
    if (deleted.length === 0) {
      throw new HttpError(404, "Word not found.");
    }
    return reply.code(204).send();
  });
}
