import { z } from "zod";

/** A calendar day in the user's local time zone, sent by the client as YYYY-MM-DD. */
export const localDateSchema = z.iso.date();

export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
