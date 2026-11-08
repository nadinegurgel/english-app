import { defineConfig } from "drizzle-kit";
import "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  casing: "snake_case",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
