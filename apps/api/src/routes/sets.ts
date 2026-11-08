import { and, asc, count, eq, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { wordSets, words } from "../db/schema.js";
import { HttpError } from "../lib/http-errors.js";

const setBody = z.object({ name: z.string().trim().min(1).max(60) });

const idParams = z.object({ id: z.coerce.number().int().positive() });

async function assertNameAvailable(name: string, exceptId?: number) {
  const existing = await db.query.wordSets.findFirst({
    where: exceptId
      ? and(eq(wordSets.name, name), ne(wordSets.id, exceptId))
      : eq(wordSets.name, name),
  });
  if (existing) {
    throw new HttpError(409, "A set with this name already exists.");
  }
}

export async function setRoutes(app: FastifyInstance) {
  app.get("/api/sets", async () => {
    return db
      .select({
        id: wordSets.id,
        name: wordSets.name,
        createdAt: wordSets.createdAt,
        wordCount: count(words.id),
      })
      .from(wordSets)
      .leftJoin(words, eq(words.setId, wordSets.id))
      .groupBy(wordSets.id)
      .orderBy(asc(wordSets.name));
  });

  app.post("/api/sets", async (request, reply) => {
    const { name } = setBody.parse(request.body);
    await assertNameAvailable(name);
    const [created] = await db.insert(wordSets).values({ name }).returning();
    return reply.code(201).send({ ...created, wordCount: 0 });
  });

  app.put("/api/sets/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const { name } = setBody.parse(request.body);
    await assertNameAvailable(name, id);
    const [updated] = await db
      .update(wordSets)
      .set({ name })
      .where(eq(wordSets.id, id))
      .returning({ id: wordSets.id, name: wordSets.name });
    if (!updated) {
      throw new HttpError(404, "Set not found.");
    }
    return updated;
  });

  // Deleting a set also deletes its words (ON DELETE CASCADE).
  app.delete("/api/sets/:id", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const deleted = await db
      .delete(wordSets)
      .where(eq(wordSets.id, id))
      .returning({ id: wordSets.id });
    if (deleted.length === 0) {
      throw new HttpError(404, "Set not found.");
    }
    return reply.code(204).send();
  });
}
