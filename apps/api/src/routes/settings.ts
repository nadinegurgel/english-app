import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSettings, updateSettings } from "../services/settings.js";

const settingsBody = z.object({
  dailyNewLimit: z.number().int().min(1).max(50),
  quizMode: z.enum(["one", "all"]),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => getSettings());

  app.put("/api/settings", async (request) => {
    return updateSettings(settingsBody.parse(request.body));
  });
}
