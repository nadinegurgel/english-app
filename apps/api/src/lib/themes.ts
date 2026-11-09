// Situations for AI sentences. Each sentence gets a random one, so sentences do not all end up in
// the same setting. University is just one theme among many.
export const SENTENCE_THEMES = [
  // Daily life and home
  "daily routine",
  "family",
  "friends",
  "housework",
  "grocery shopping",
  "cooking and food",
  // Work and studies
  "office work",
  "meetings and colleagues",
  "job interview",
  "university",
  "online course",
  // Leisure and culture
  "travel",
  "TV series and movies",
  "music",
  "sports",
  "social media",
  "technology",
  // Health and society
  "doctor and health",
  "wellbeing",
  "city life",
  "public transport",
  "news",
  "environment",
] as const;

/** `count` different random themes (themes repeat only if count exceeds the list). */
export function pickThemes(count: number, random = Math.random): string[] {
  const picked: string[] = [];
  let pool: string[] = [];
  while (picked.length < count) {
    if (pool.length === 0) pool = [...SENTENCE_THEMES];
    const [theme] = pool.splice(Math.floor(random() * pool.length), 1);
    picked.push(theme!);
  }
  return picked;
}
