# physio-api

Backend for the physiotherapy clinic website and admin CRM. NestJS + TypeScript
+ Prisma + PostgreSQL + Redis. This service owns all data and business logic;
both frontends are pure consumers of the OpenAPI contract in `openapi.json`.

**Current state: Milestone 0 (foundations).** There are no domain models,
authentication or business endpoints yet — only `GET /api/v1/health` and the
tooling everything else will be built on.

---

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22.x | Pinned in `.node-version`. Newer majors are not supported. |
| npm | 10.x | Ships with Node 22. |
| Docker | any recent | Runs PostgreSQL and Redis locally. |

If you use a version manager (`nvm`, `fnm`, `asdf`), it will pick up
`.node-version`. Otherwise make sure `node --version` prints `v22.x` before you
run anything below.

---

## First run

```bash
# 1. Configuration — copy the documented template and adjust if you need to.
cp .env.example .env

# 2. Install dependencies (this also runs `prisma generate`).
npm install

# 3. Start PostgreSQL and Redis.
docker compose up -d

# 4. Wait until both report "healthy".
docker compose ps

# 5. Start the API.
npm run start:dev
```

The API listens on <http://localhost:4000>.

- Health: <http://localhost:4000/api/v1/health>
- Swagger UI: <http://localhost:4000/api/docs>

### Ports

Host ports are deliberately non-default so they cannot collide with a
PostgreSQL or Redis you already have installed.

| Service | Host port | Container port |
|---|---|---|
| API | 4000 | 4000 |
| PostgreSQL | 5433 | 5432 |
| Redis | 6380 | 6379 |

---

## Health check

`GET /api/v1/health` pings PostgreSQL and Redis on every request — it does not
report cached state.

```json
{
  "status": "ok",
  "dependencies": {
    "database": { "status": "up", "latencyMs": 2 },
    "redis": { "status": "up", "latencyMs": 1 }
  }
}
```

Returns **200** when both dependencies are reachable and **503** when either is
not, with the failing dependency marked `"down"`. The underlying driver error is
written to the log, never to the response body. The API boots and keeps serving
this endpoint even when a dependency is unavailable, and recovers on its own
when the dependency returns.

---

## Database migrations

The Prisma schema currently declares a datasource and generator only — the
domain model arrives in Milestone 1, so there are no migrations to apply yet.

```bash
npm run prisma:generate   # regenerate the client after a schema change
npm run prisma:migrate    # create and apply a migration in development
```

`prisma:migrate` reads `DATABASE_URL` from `.env`, so the containers from
`docker compose up -d` must be running.

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run start:dev` | Start the API with hot reload. |
| `npm run start` | Start the API once, no watcher. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run start:prod` | Run the compiled build (`npm run build` first). |
| `npm test` | Run the unit test suite. No database required. |
| `npm run test:watch` | Run unit tests in watch mode. |
| `npm run test:cov` | Run unit tests with a coverage report. |
| `npm run lint` | ESLint + Prettier check. Fails on any problem. |
| `npm run lint:fix` | Same, applying every fix it can. |
| `npm run typecheck` | `tsc --noEmit` against the strict config. |
| `npm run generate:openapi` | Regenerate `openapi.json`. |

### Docker

```bash
docker compose up -d      # start PostgreSQL and Redis
docker compose ps         # check health
docker compose logs -f    # follow both services
docker compose down       # stop; named volumes keep the data
docker compose down -v    # stop AND delete the data volumes
```

Data lives in the named volumes `physio-postgres-data` and `physio-redis-data`,
so it survives `docker compose down`.

To build and run the API's own production image:

```bash
docker build -t physio-api .
```

---

## The OpenAPI contract

`openapi.json` in the repository root is the contract the website and CRM
generate their TypeScript types from. **It is committed, and it must stay
current.** Whenever you add or change an endpoint or a DTO:

```bash
npm run generate:openapi
```

and commit the resulting `openapi.json` in the same change. The script boots the
Nest application in memory without listening on a port, so it needs a valid
`.env` but no running database.

---

## Configuration

Every environment variable is documented with a placeholder value in
`.env.example`. `.env` is git-ignored and must never be committed.

Configuration is validated at startup: an invalid or missing variable stops the
process with a message naming the offending variable rather than failing later
at the first request.

`CORS_ALLOWED_ORIGINS` is a comma-separated allow-list of browser origins (the
public website and the CRM). An origin that is not listed receives no
`Access-Control-Allow-Origin` header and is blocked by the browser.

---

## Logging

Structured JSON via Pino. Every request is assigned a request ID — taken from an
inbound `x-request-id` header when present, otherwise generated — which is
echoed back on the response and attached to every log line for that request.

Sensitive fields (`authorization`, `cookie`, `set-cookie`, `password`, `token`,
`phone`, `email`) are redacted by the log serializer. In development the output
is pretty-printed; in production it is raw JSON for log shipping.

---

## Project layout

```
src/
  main.ts                     bootstrap: prefix, CORS, Swagger
  app.module.ts               config, logging, global pipe and filter
  swagger.ts                  OpenAPI document, shared with the generator script
  common/
    filters/                  global exception filter
    logging/                  Pino options and redaction paths
  config/                     environment schema and validation
  modules/
    health/                   GET /api/v1/health
    prisma/                   PrismaService
    redis/                    RedisService
prisma/schema.prisma          datasource + generator
scripts/generate-openapi.ts   writes openapi.json
```

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
install → lint → typecheck → test → build. It needs no database, because the
suite at this stage is unit tests only.
