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
  // Shared dictionary limits: after this many AI sentences per word, stored ones are reused.
  EXAMPLE_SENTENCES_PER_WORD: z.coerce.number().int().min(1).max(20).default(5),
  QUIZ_SENTENCES_PER_WORD: z.coerce.number().int().min(2).max(30).default(8),
});

export const env = envSchema.parse(process.env);
