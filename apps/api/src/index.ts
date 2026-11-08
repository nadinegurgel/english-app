import cors from "@fastify/cors";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import { db, sqlClient } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { env } from "./env.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/api/health", async (_request, reply) => {
  try {
    await db.execute(sql`select 1`);
    return { status: "ok", database: "up" };
  } catch (error) {
    app.log.error(error);
    return reply.code(503).send({ status: "error", database: "down" });
  }
});

const shutdown = async () => {
  await app.close();
  await sqlClient.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await runMigrations();
await app.listen({ port: env.PORT, host: env.HOST });
