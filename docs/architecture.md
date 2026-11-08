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

## Screens

- **Today**: new words and reviews due, "Start quiz", progress, streak, upcoming reviews.
- **Add words**: paste one word per line, choose a set, preview and edit meaning and example sentence, duplicate warnings.
- **Words**: sets and words, search, edit, delete, practice a set.

## Spaced repetition (planned)

Each word has its own schedule, counted from the day it is first studied:

- Day 1: first study (new word, up to the daily limit)
- Day 3: first review
- Day 7: second review, after which the word is "learned"
- A wrong answer re-queues the word at the end of the current quiz and adds an extra review the next day.
- Missed days do not drop reviews: overdue words appear on "Today", and the next interval starts from the day they were actually reviewed.

The exact data model is defined in the spaced repetition stage.

## AI suggestions

`POST /api/words/suggestions` sends up to 50 terms in one request to `claude-haiku-5-5` (effort `low`, structured JSON output) and returns a Portuguese meaning and a B1 example sentence for each. The web app sends batches of 20. Without `ANTHROPIC_API_KEY` the endpoint returns 503 and the preview falls back to manual fields.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database status and whether AI suggestions are enabled |
| GET | `/api/sets` | Sets with word counts |
| POST | `/api/sets` | Create a set (409 if the name exists) |
| POST | `/api/words/check` | Which terms are already saved, and in which set |
| POST | `/api/words/suggestions` | AI meaning and example sentence per term |
| POST | `/api/words` | Save words to a set, skipping duplicates |
