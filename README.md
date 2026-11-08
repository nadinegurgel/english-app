# English Words

A personal English vocabulary app with spaced repetition. It runs in the browser and can be installed on a phone as a Progressive Web App (PWA).

## Stack

| Layer | Technology |
| --- | --- |
| Web app | React 19, TypeScript, Vite, `vite-plugin-pwa` |
| API | Node.js 24, Fastify 5, TypeScript |
| Database | PostgreSQL 17, Drizzle ORM (migrations in `apps/api/drizzle`) |
| AI | Claude API (`claude-haiku-5-5`) for example sentences and meanings, called only from the API |
| Runtime | Docker Compose (local and VPS) |

See [docs/architecture.md](docs/architecture.md) for the design and the decisions behind it.

## Project layout

```
apps/
  api/   Fastify API, database schema and migrations
  web/   React PWA (screens: Today, Add words, Words)
docs/    Architecture notes and decisions
docker-compose.yml
```

## Requirements

- Node.js 24 or newer
- Docker Desktop (running)

## Getting started

```bash
cp .env.example .env        # then edit the values
npm install
docker compose up -d db     # start PostgreSQL
npm run dev                 # API on :3000, web app on :5173
```

Open http://localhost:5173. The "Today" screen shows **Servidor conectado** when the API can reach the database. Migrations run automatically when the API starts.

### Enabling AI example sentences

1. Create an API key at https://console.anthropic.com (prepaid credits; you can set a monthly spend limit there).
2. Put it in `.env` as `ANTHROPIC_API_KEY=...` and restart `npm run dev`.

Without a key, the "Add words" preview still works and you fill in the meaning and sentence yourself.

### Testing on your phone (same Wi-Fi)

`npm run dev` also prints a **Network** address (for example `http://192.168.x.x:5173`). Open it on the phone. Installing the PWA and push notifications require HTTPS, so they only work after deploying with a domain.

### Full stack in Docker

```bash
docker compose up --build
```

Open http://localhost:8080. Nginx serves the web app and proxies `/api` to the API container.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API and the web app with hot reload |
| `npm run build` | Builds both apps |
| `npm run typecheck` | Type-checks both apps |
| `npm run db:generate` | Creates a new SQL migration after changing `apps/api/src/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations manually |

## Backups

```bash
docker compose exec db pg_dump -U english_app english_app > backup.sql
```
