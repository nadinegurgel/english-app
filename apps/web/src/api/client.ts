export type HealthStatus = { status: "ok" | "error"; database: "up" | "down"; ai: boolean };

export type WordSet = { id: number; name: string; createdAt: string; wordCount: number };

export type DuplicateCheck = { term: string; existing: { id: number; setName: string } | null };

export type Suggestion = {
  term: string;
  meaningPt: string;
  exampleSentence: string;
  sentenceHasTerm: boolean;
  fromDictionary: boolean;
};

export type RelatedWord = { term: string; meaningPt: string };

export type NewWord = { term: string; meaningPt?: string; exampleSentence?: string };

export type Word = {
  id: number;
  setId: number;
  term: string;
  meaningPt: string | null;
  exampleSentence: string | null;
};

export type WordUpdate = { term: string; meaningPt: string; exampleSentence: string };

export type QuizMode = "one" | "all";

export type Settings = { dailyNewLimit: number; quizMode: QuizMode };

export type Question = {
  wordId: number;
  prompt: string;
  options: string[];
  answer: string;
  meaningPt: string | null;
  sentence: string;
};

export type TodaySummary = {
  newCount: number;
  reviewCount: number;
  streak: { days: number; studiedToday: boolean };
  progress: { total: number; learned: number; learning: number; new: number };
  withoutSentence: number;
  upcoming: { day: string; count: number }[];
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, (data as { error?: string }).error ?? "Request failed.");
  }
  return data as T;
}

export const api = {
  health: () => request<HealthStatus>("/api/health"),
  listSets: () => request<WordSet[]>("/api/sets"),
  createSet: (name: string) => request<WordSet>("/api/sets", { method: "POST", body: { name } }),
  renameSet: (id: number, name: string) =>
    request<{ id: number; name: string }>(`/api/sets/${id}`, { method: "PUT", body: { name } }),
  deleteSet: (id: number) => request<void>(`/api/sets/${id}`, { method: "DELETE" }),
  listWords: () => request<Word[]>("/api/words"),
  updateWord: (id: number, changes: WordUpdate) =>
    request<Word>(`/api/words/${id}`, { method: "PUT", body: changes }),
  deleteWord: (id: number) => request<void>(`/api/words/${id}`, { method: "DELETE" }),
  today: (today: string) => request<TodaySummary>(`/api/today?today=${today}`),
  dailyQuiz: (today: string) => request<Question[]>(`/api/quiz/daily?today=${today}`),
  practiceQuiz: (setId: number) => request<Question[]>(`/api/quiz/practice/${setId}`),
  recordAnswer: (wordId: number, correct: boolean, today: string) =>
    request<{ dayCompleted: boolean }>("/api/quiz/answers", {
      method: "POST",
      body: { wordId, correct, today },
    }),
  getSettings: () => request<Settings>("/api/settings"),
  updateSettings: (settings: Settings) =>
    request<Settings>("/api/settings", { method: "PUT", body: settings }),
  checkDuplicates: (terms: string[]) =>
    request<DuplicateCheck[]>("/api/words/check", { method: "POST", body: { terms } }),
  // `seen` lists the sentences already shown for each term, most recent last.
  suggest: (items: { term: string; seen: string[] }[]) =>
    request<Suggestion[]>("/api/words/suggestions", { method: "POST", body: { items } }),
  relatedWords: (body: { setId?: number; terms: string[]; exclude: string[] }) =>
    request<RelatedWord[]>("/api/words/related", { method: "POST", body }),
  saveWords: (setId: number, words: NewWord[]) =>
    request<{ created: number; skipped: number }>("/api/words", {
      method: "POST",
      body: { setId, words },
    }),
};
