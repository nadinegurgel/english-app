import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const sqlClient = postgres(env.DATABASE_URL);

export const db = drizzle(sqlClient, { schema, casing: "snake_case" });
