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

## Screens

- **Today**: new words and reviews due, "Start quiz", progress, streak, upcoming reviews.
- **Add words**: paste one word per line, choose a set, preview and edit meaning and example sentence, duplicate warnings.
- **Words**: sets and words, search, edit, delete, practice a set.

## Spaced repetition (planned)

Each word has its own schedule, counted from the day it is first studied:

- Day 1: first study (new word)
- Day 3: first review
- Day 7: second review
- A wrong answer re-queues the word at the end of the current quiz and adds an extra review the next day.

The exact data model is defined in the spaced repetition stage.
