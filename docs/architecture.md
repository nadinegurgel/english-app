# Architecture

## Overview

```
Browser / phone (PWA)
        │  HTTPS (on the VPS)
        ▼
   web (nginx) ── static React build
        │  /api/*
        ▼
   api (Fastify) ── Claude API (example sentences)
        │
        ▼
   db (PostgreSQL, Docker volume)
```

All data lives in PostgreSQL on the server. Every device that opens the app talks to the same API, so progress is shared between phone and computer once the app is deployed. While developing, everything runs on the local machine.

## Decision log

| # | Decision | Reason |
| --- | --- | --- |
| 1 | PWA instead of a native app | One codebase for browser and phone, no app store. Can be wrapped with Capacitor later if a real alarm is needed. |
| 2 | Self-hosted on a VPS with Docker Compose | Same setup locally and in production; no vendor lock-in. |
| 3 | PostgreSQL | Reliable relational store; easy backups with `pg_dump`. |
| 4 | Drizzle ORM | Lightweight, type-safe, SQL-like queries and plain SQL migrations. |
| 5 | Fastify | Small, fast, first-class TypeScript support. |
| 6 | Claude API with `claude-haiku-5-5` | Generates B1 example sentences and Portuguese meanings for a few cents per month. The API key stays on the server. |
| 7 | First reminder is a recurring calendar event (.ics) | Works on every device without a server-side scheduler. Web push can be added after the app runs on HTTPS. |
| 8 | A word exists only once across all sets | One schedule and one history per word. Duplicates are detected on a normalized term (trimmed, lowercased, single spaces) and enforced by a unique index. |
| 9 | Example sentences must contain the exact term | The quiz blanks the term out of the sentence. The API and the UI both check it; the user cannot save a sentence that fails the check. |
| 10 | A word is "learned" after the Day 7 review | It leaves the daily quiz but can still be practiced from its set. |
| 11 | Adjustable daily limit for new words | Avoids a large pile of Day 3 and Day 7 reviews after pasting many words. Words above the limit start on the following days. |
| 12 | Overdue reviews accumulate on "Today" | After each review, the next date is counted from the day it was actually studied. |
| 13 | Words are edited inline in their set card | The list stays in view; no extra screen. |
| 14 | Search runs on the client | A single user has at most a few thousand words, so filtering in the browser is instant. Search ignores accents and matches the term or the Portuguese meaning. |
| 15 | Sets can be renamed and deleted | Deleting a set deletes its words, after an explicit confirmation. Words cannot be moved between sets for now. |
| 16 | "Practice" is free training | Practicing a set never changes the schedule or the streak. |
| 17 | Wrong options are mixed | Up to 2 of the user's own words with the same part of speech and the same form (-ing, -ed, -s, base), completed with AI distractors generated once per word and stored. Without AI, any of the user's other words are used. |
| 18 | Daily new-word limit starts at 5 | Adjustable from 1 to 50 in Settings. |
| 19 | A day counts for the streak when the whole daily quiz is finished | Days with nothing scheduled are recorded as "rest" days when the app is opened: they keep the streak without adding to it. |
| 20 | A wrong answer adds an extra review the next day | The regular Day 3 / Day 7 schedule continues; nothing restarts. The word also comes back once at the end of the current quiz. |
| 21 | The client sends its local date | All "today" logic uses the device's calendar day (YYYY-MM-DD), so the server's time zone does not matter. |
| 22 | The quiz never uses the example sentence | Each word has its own pool of quiz sentences, so the user learns the word and not one sentence. The example sentence stays in "Words" for study. |
| 23 | Quiz sentences come from a stored pool | 4 sentences are created per word in the background; the quiz picks the least used one and tops up the pool when only one unused sentence is left (up to 16 per word, then it rotates). Opening a quiz never waits for AI, except for a word with no sentence yet. |
| 24 | Related word suggestions in the "Add words" preview | 5 at a time, with the Portuguese meaning beside each word. Based on the set's words and the preview, at the same level (never above B2), never a word already saved or already shown. Chosen words join the preview for review before saving. |
| 25 | Shared dictionary to save AI tokens | AI output is stored per normalized term in `dictionary_*` tables and reused by every user. "Gerar frase" shows an unseen stored sentence first, asks the AI only while the term has fewer than `EXAMPLE_SENTENCES_PER_WORD` (5), and rotates stored ones after that. The Portuguese meaning is generated once per term. |
| 26 | Shared quiz sentence pool | Quiz sentences belong to the term (up to `QUIZ_SENTENCES_PER_WORD`, 8), while `quiz_sentence_views` tracks rotation per word, so each user has their own rotation. |
| 27 | The dictionary only holds AI output | Meanings and sentences typed or edited by a user stay on their word and are never shared. |
| 28 | One dictionary entry per spelling | Words with several meanings (e.g. "bank") share one entry for now; senses can be split later. |

## Screens

- **Today**: new words and reviews due, "Start quiz", progress, streak, upcoming reviews, link to Settings.
- **Quiz**: daily quiz or free practice of a set, results with right and wrong words.
- **Settings**: daily new-word limit and quiz format.
- **Add words**: paste one word per line, choose a set, preview and edit meaning and example sentence, duplicate warnings, related word suggestions.
- **Words**: sets and words, search, inline edit, delete, rename and delete sets, practice a set (enabled with the quiz).

## Spaced repetition

Each word has its own schedule (`apps/api/src/services/schedule.ts`):

| Stage | Meaning | Next step |
| --- | --- | --- |
| 0 | New | Enters the daily quiz, up to the daily limit, oldest first |
| 1 | Day 1 done | Review 2 days later (Day 3) |
| 2 | Day 3 done | Review 4 days later (Day 7) |
| 3 | Learned | Leaves the daily quiz; can still be practiced |

- Intervals are counted from the day the review was actually done, so overdue reviews simply accumulate on "Today".
- A wrong answer sets `extra_review_on` to the next day, independent of the regular schedule.
- Only the first answer to a word in a quiz is recorded. Wrong words are shown once more at the end of the quiz.
- The rules are covered by unit tests in `apps/api/test/schedule.test.ts` (`npm test`).

## Quiz

- Questions blank out the term in a quiz sentence and show 4 shuffled options.
- Quiz sentences come from the shared pool (`dictionary_quiz_sentences`), each with its own 3 AI distractors. The word picks the sentence it has seen least (`quiz_sentence_views`); the user's example sentence is never a question. The example sentence is only used as a fallback when AI is off.
- The pool is filled in the background when words are saved and when the API starts, and topped up when a word has one unseen sentence left, until the term reaches its limit.
- After answering, the quiz shows the quiz sentence completed with the term.
- Two formats: one question at a time, or all on one screen. The choice is saved in Settings and can be changed at the start of each quiz.

## Shared dictionary

```
dictionary_entries            normalized_term (PK), term, meaning_pt, part_of_speech
dictionary_example_sentences  up to EXAMPLE_SENTENCES_PER_WORD per term
dictionary_quiz_sentences     up to QUIZ_SENTENCES_PER_WORD per term, with distractors
quiz_sentence_views           (word_id, sentence_id) -> times_used, last_used_at
```

The dictionary is filled only by the AI and shared by everyone. Each word keeps its own meaning and example sentence, so a user's edits never reach other users. "Gerar frase" sends the sentences already shown for the term (`seen`), and the API follows these rules (`pickStored`, covered by unit tests):

1. A stored sentence the user has not seen yet, without AI.
2. If every stored sentence was seen and the term has room, a new AI sentence, which is stored.
3. If the term is full, a stored sentence other than the one on screen.

## AI suggestions

All AI calls go through `apps/api/src/services/claude.ts` (`claude-haiku-5-5`, effort `low`, structured JSON output). `POST /api/words/suggestions` answers from the shared dictionary when it can and only sends the remaining terms to the AI, in one request. Without `ANTHROPIC_API_KEY`, stored dictionary data is still served; the endpoint returns 503 only when nothing is available, and the preview falls back to manual fields.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database status and whether AI suggestions are enabled |
| GET | `/api/sets` | Sets with word counts |
| POST | `/api/sets` | Create a set (409 if the name exists) |
| PUT | `/api/sets/:id` | Rename a set (409 if the name exists) |
| DELETE | `/api/sets/:id` | Delete a set and its words |
| GET | `/api/words` | All words |
| POST | `/api/words/check` | Which terms are already saved, and in which set |
| POST | `/api/words/suggestions` | Meaning and example sentence per term, from the dictionary or AI |
| POST | `/api/words/related` | 5 new words related to a set, with Portuguese meanings |
| POST | `/api/words` | Save words to a set, skipping duplicates |
| PUT | `/api/words/:id` | Edit term, meaning and sentence (409 on duplicate spelling) |
| DELETE | `/api/words/:id` | Delete a word |
| GET | `/api/today?today=` | Counts for today, streak, progress and upcoming reviews |
| GET | `/api/quiz/daily?today=` | Questions for today's quiz |
| GET | `/api/quiz/practice/:setId` | Questions for free practice of a set |
| POST | `/api/quiz/answers` | Record the first answer to a word and update its schedule |
| GET / PUT | `/api/settings` | Daily new-word limit and quiz format |
