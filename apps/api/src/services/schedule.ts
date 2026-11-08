import { and, asc, count, eq, gt, isNotNull, lte, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { studyDays, words } from "../db/schema.js";
import { addDays } from "../lib/dates.js";
import { getSettings } from "./settings.js";

export const Stage = { New: 0, FirstReview: 1, SecondReview: 2, Learned: 3 } as const;

// Days between steps: Day 1 -> Day 3 -> Day 7, each counted from the day actually studied.
const DAYS_TO_FIRST_REVIEW = 2;
const DAYS_TO_SECOND_REVIEW = 4;

type ScheduledWord = Pick<typeof words.$inferSelect, "stage" | "dueOn">;

/** Schedule changes for a word answered in the daily quiz on `today`. */
export function scheduleAfterAnswer(word: ScheduledWord, correct: boolean, today: string) {
  const changes: Partial<typeof words.$inferInsert> = {
    lastReviewedOn: today,
    // A wrong answer adds an extra review tomorrow; a right one clears any pending extra review.
    extraReviewOn: correct ? null : addDays(today, 1),
  };

  if (word.stage === Stage.New) {
    changes.stage = Stage.FirstReview;
    changes.introducedOn = today;
    changes.dueOn = addDays(today, DAYS_TO_FIRST_REVIEW);
  } else if (word.dueOn && word.dueOn <= today) {
    if (word.stage === Stage.FirstReview) {
      changes.stage = Stage.SecondReview;
      changes.dueOn = addDays(today, DAYS_TO_SECOND_REVIEW);
    } else if (word.stage === Stage.SecondReview) {
      changes.stage = Stage.Learned;
      changes.dueOn = null;
    }
  }
  return changes;
}

const quizzable = isNotNull(words.exampleSentence);

const reviewDueOn = (today: string) =>
  and(
    quizzable,
    gt(words.stage, Stage.New),
    or(lte(words.dueOn, today), lte(words.extraReviewOn, today)),
  );

/** Words for today's quiz: every review due, plus new words up to the daily limit. */
export async function dueWords(today: string) {
  const { dailyNewLimit } = await getSettings();
  const [introduced] = await db
    .select({ value: count() })
    .from(words)
    .where(eq(words.introducedOn, today));
  const remainingNew = Math.max(0, dailyNewLimit - (introduced?.value ?? 0));

  const reviews = await db.select().from(words).where(reviewDueOn(today));
  const fresh = remainingNew
    ? await db
        .select()
        .from(words)
        .where(and(quizzable, eq(words.stage, Stage.New)))
        .orderBy(asc(words.createdAt), asc(words.id))
        .limit(remainingNew)
    : [];
  return { reviews, fresh };
}

export async function markDayIfComplete(today: string): Promise<boolean> {
  const { reviews, fresh } = await dueWords(today);
  if (reviews.length > 0 || fresh.length > 0) return false;
  const [answeredToday] = await db
    .select({ value: count() })
    .from(words)
    .where(eq(words.lastReviewedOn, today));
  if (!answeredToday?.value) return false;
  // A rest day recorded earlier today becomes a studied day.
  await db
    .insert(studyDays)
    .values({ day: today, kind: "studied" })
    .onConflictDoUpdate({ target: studyDays.day, set: { kind: "studied" } });
  return true;
}

async function markRestDay(today: string) {
  await db.insert(studyDays).values({ day: today, kind: "rest" }).onConflictDoNothing();
}

async function streak(today: string): Promise<{ days: number; studiedToday: boolean }> {
  const rows = await db.select({ day: studyDays.day, kind: studyDays.kind }).from(studyDays);
  const days = new Map(rows.map((row) => [row.day, row.kind]));
  const studiedToday = days.get(today) === "studied";
  // Today does not break the streak yet; rest days are skipped without counting.
  let cursor = days.has(today) ? today : addDays(today, -1);
  let total = 0;
  while (days.has(cursor)) {
    if (days.get(cursor) === "studied") total++;
    cursor = addDays(cursor, -1);
  }
  return { days: total, studiedToday };
}

export async function todaySummary(today: string) {
  const { reviews, fresh } = await dueWords(today);
  const [wordCount] = await db.select({ value: count() }).from(words);
  if (reviews.length === 0 && fresh.length === 0 && wordCount?.value) {
    await markRestDay(today);
  }
  const all = await db
    .select({
      stage: words.stage,
      dueOn: words.dueOn,
      extraReviewOn: words.extraReviewOn,
      exampleSentence: words.exampleSentence,
    })
    .from(words);

  const upcoming: { day: string; count: number }[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const day = addDays(today, offset);
    const total = all.filter(
      (word) =>
        word.stage > Stage.New &&
        ((word.stage < Stage.Learned && word.dueOn === day) || word.extraReviewOn === day),
    ).length;
    if (total > 0) upcoming.push({ day, count: total });
  }

  return {
    newCount: fresh.length,
    reviewCount: reviews.length,
    streak: await streak(today),
    progress: {
      total: all.length,
      learned: all.filter((word) => word.stage === Stage.Learned).length,
      learning: all.filter((word) => word.stage > Stage.New && word.stage < Stage.Learned).length,
      new: all.filter((word) => word.stage === Stage.New).length,
    },
    withoutSentence: all.filter((word) => !word.exampleSentence).length,
    upcoming,
  };
}

