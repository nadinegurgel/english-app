/** Today's date in the device's time zone, as YYYY-MM-DD. */
export function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric" });

/** "amanhã", or a weekday such as "segunda-feira, 10". */
export function describeUpcomingDay(day: string, today: string): string {
  const date = new Date(`${day}T12:00:00`);
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return "amanhã";
  return weekdayFormat.format(date);
}
