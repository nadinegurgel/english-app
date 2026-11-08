import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { wordSets, words } from "../db/schema.js";
import { HttpError } from "../lib/http-errors.js";
import { normalizeTerm } from "../lib/normalize.js";
import { generateSuggestions } from "../services/suggestions.js";

const termList = z.array(z.string().trim().min(1).max(100)).min(1).max(200);

const checkBody = z.object({ terms: termList });

const suggestionsBody = z.object({ terms: termList.max(50) });

const saveBody = z.object({
  setId: z.number().int().positive(),
  words: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(100),
        meaningPt: z.string().trim().max(200).optional(),
        exampleSentence: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(200),
});

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
  app.post("/api/words/check", async (request) => {
    const { terms } = checkBody.parse(request.body);
    const existing = await findExisting(terms.map(normalizeTerm));
    return terms.map((term) => ({
      term,
      existing: existing.get(normalizeTerm(term)) ?? null,
    }));
  });

  app.post("/api/words/suggestions", async (request) => {
    const { terms } = suggestionsBody.parse(request.body);
    return generateSuggestions(terms);
  });

  app.post("/api/words", async (request, reply) => {
    const body = saveBody.parse(request.body);

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

    const created = toInsert.length
      ? await db.insert(words).values(toInsert).onConflictDoNothing().returning()
      : [];

    return reply.code(201).send({
      created: created.length,
      skipped: body.words.length - created.length,
    });
  });
}
