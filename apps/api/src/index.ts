import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import { ZodError } from "zod";
import { db, sqlClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { env } from "./env.js";
import { HttpError } from "./lib/http-errors.js";
import { quizRoutes } from "./routes/quiz.js";
import { setRoutes } from "./routes/sets.js";
import { settingsRoutes } from "./routes/settings.js";
import { wordRoutes } from "./routes/words.js";
import { isAiEnabled } from "./services/claude.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ error: "Invalid request.", issues: error.issues });
  }
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "Something went wrong." });
});

app.get("/api/health", async (_request, reply) => {
  try {
    await db.execute(sql`select 1`);
    return { status: "ok", database: "up", ai: isAiEnabled };
  } catch (error) {
    app.log.error(error);
    return reply.code(503).send({ status: "error", database: "down", ai: isAiEnabled });
  }
});

await app.register(setRoutes);
await app.register(wordRoutes);
await app.register(quizRoutes);
await app.register(settingsRoutes);

const shutdown = async () => {
  await app.close();
  await sqlClient.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await runMigrations();
await app.listen({ port: env.PORT, host: env.HOST });
