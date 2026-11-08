import { asc, count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { wordSets, words } from "../db/schema.js";
import { HttpError } from "../lib/http-errors.js";

const createSetBody = z.object({ name: z.string().trim().min(1).max(60) });

export async function setRoutes(app: FastifyInstance) {
  app.get("/api/sets", async () => {
    return db
      .select({ id: wordSets.id, name: wordSets.name, wordCount: count(words.id) })
      .from(wordSets)
      .leftJoin(words, eq(words.setId, wordSets.id))
      .groupBy(wordSets.id)
      .orderBy(asc(wordSets.name));
  });

  app.post("/api/sets", async (request, reply) => {
    const { name } = createSetBody.parse(request.body);
    const existing = await db.query.wordSets.findFirst({ where: eq(wordSets.name, name) });
    if (existing) {
      throw new HttpError(409, "A set with this name already exists.");
    }
    const [created] = await db.insert(wordSets).values({ name }).returning();
    return reply.code(201).send({ ...created, wordCount: 0 });
  });
}
