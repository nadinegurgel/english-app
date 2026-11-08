import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// In local development the variables live in the repository root .env file.
// In Docker they are injected by docker compose, so the file is optional.
const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
