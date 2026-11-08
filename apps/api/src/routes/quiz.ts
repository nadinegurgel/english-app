import { and, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { words } from "../db/schema.js";
import { localDateSchema } from "../lib/dates.js";
import { HttpError } from "../lib/http-errors.js";
import { buildQuestions } from "../services/questions.js";
import {
  dueWords,
  markDayIfComplete,
  scheduleAfterAnswer,
  todaySummary,
} from "../services/schedule.js";

const todayQuery = z.object({ today: localDateSchema });

const setParams = z.object({ setId: z.coerce.number().int().positive() });

const answerBody = z.object({
  wordId: z.number().int().positive(),
  correct: z.boolean(),
  today: localDateSchema,
});

export async function quizRoutes(app: FastifyInstance) {
  app.get("/api/today", async (request) => {
    const { today } = todayQuery.parse(request.query);
    return todaySummary(today);
  });

  // The daily quiz: reviews due today plus new words up to the daily limit.
  app.get("/api/quiz/daily", async (request) => {
    const { today } = todayQuery.parse(request.query);
    const { reviews, fresh } = await dueWords(today);
    return buildQuestions([...reviews, ...fresh]);
  });

  // Free practice of one set. Answers are not recorded and do not change the schedule.
  app.get("/api/quiz/practice/:setId", async (request) => {
    const { setId } = setParams.parse(request.params);
    const setWords = await db
      .select()
      .from(words)
      .where(and(eq(words.setId, setId), isNotNull(words.exampleSentence)));
    return buildQuestions(setWords);
  });

  // Records the first answer to a word in the daily quiz and updates its schedule.
  app.post("/api/quiz/answers", async (request) => {
    const { wordId, correct, today } = answerBody.parse(request.body);
    const word = await db.query.words.findFirst({ where: eq(words.id, wordId) });
    if (!word) {
      throw new HttpError(404, "Word not found.");
    }
    await db
      .update(words)
      .set(scheduleAfterAnswer(word, correct, today))
      .where(eq(words.id, wordId));
    return { dayCompleted: await markDayIfComplete(today) };
  });
}
