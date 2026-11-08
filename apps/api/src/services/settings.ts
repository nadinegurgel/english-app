import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

export type Settings = { dailyNewLimit: number; quizMode: "one" | "all" };

export async function getSettings(): Promise<Settings> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  return { dailyNewLimit: row!.dailyNewLimit, quizMode: row!.quizMode };
}

export async function updateSettings(changes: Settings): Promise<Settings> {
  await getSettings();
  await db.update(settings).set(changes).where(eq(settings.id, 1));
  return getSettings();
}
