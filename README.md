# Splitly

A group expense-splitting app for flats, trips and friend groups. Add what you paid, split it four ways, see who owes whom, and settle up in the fewest payments.

Splitly only **records** payments made by cash or UPI. It never moves money.

**Live app:** https://splitly-five-sable.vercel.app

**Live API:** https://splitly-0qy4.onrender.com/api/health. It runs on a free Render instance, so the first request after a quiet spell can take about 50 seconds.

## Features

- **Accounts:** register, log in, log out, update your name or password. Sessions use an HttpOnly JWT cookie.
- **Groups:**
  - create a group with a fixed currency (INR, USD, EUR, GBP, AED, SGD);
  - add members by email; leave or remove members;
  - rename or delete the group (admins).
- **Expenses:**
  - split **equally**, by **exact amounts**, by **percentage** or by **shares**;
  - category and date on each expense; search and filters;
  - edit, and soft-delete that keeps the history.
- **Balances:** each member's net balance, plus the raw "who owes whom" list.
- **Debt simplification:** the fewest payments that settle the whole group (greedy min-cash-flow).
- **Settlements:** record a payment, and undo it.
- **Activity log:** every change, including deletions and undos.
- **Dashboard:** what you owe and are owed across all groups, per currency.
- **Web client:**
  - React with an animated landing page;
  - mobile-friendly bottom-sheet forms;
  - a live split preview that matches the server to the paisa.

## Money rules

Getting balances right is the core of the project:

| Rule | How it is enforced |
|---|---|
| Money is stored as **integer paise** (`amountCents`), never floats. | `BIGINT` columns; the API accepts and returns integers only |
| An expense's split shares always add up to its total. | Largest-remainder method; leftover paise go to a fixed person, so results are repeatable |
| Every group's balances always total **zero**. | Checked by unit and integration tests after every kind of change |
| A suggested settlement plan always clears every balance. | Greedy min-cash-flow, at most *n − 1* transfers, never more than the raw pairwise list |
| Nothing silently disappears. | Deleted expenses are soft-deleted; undone payments stay in the activity log |

Details are in [docs/architecture.md](docs/architecture.md).

## Tech stack

| Layer | Tools |
|---|---|
| API | Node.js 22, Express 5, Zod 4 (validation), `pg`, `node-pg-migrate`, bcryptjs, jsonwebtoken, helmet, express-rate-limit, pino |
| Database | PostgreSQL |
| Client | React 19, Vite 6, React Router 7, TanStack Query 5, Tailwind CSS 4, Motion, GSAP, Lenis |
| Tests | Jest 30, Supertest: **266 tests** across 2 unit and 6 integration suites |
| Hosting | Vercel (client), Render (API and Postgres) |

## Repository layout

```
Due/
├── server/                 Express API (its own package.json)
│   ├── migrations/         database schema (node-pg-migrate)
│   └── src/
│       ├── routes/         URL → middleware → controller
│       ├── middleware/     auth, membership/permission checks, validation, errors
│       ├── validators/     Zod schemas for every request
│       ├── controllers/    HTTP in/out only
│       ├── services/       business rules, transactions, activity logging
│       ├── repositories/   SQL
│       └── lib/            money splitting, balances and simplification, cursors, dates
├── client/                 React web app (its own package.json)
├── tests/                  Jest tests for the API
│   ├── unit/               money.test.js, balances.test.js
│   └── integration/        auth, groups, expenses, balances, settlements, activity
├── docs/
│   ├── api.md              API reference
│   ├── architecture.md     data model, money and the algorithms
│   └── deployment.md       deploying to Render
├── jest.config.js
└── package.json            test runner (jest, supertest)
```

## Running it locally

You need **Node.js 22** and **PostgreSQL** (14 or newer).

### 1. Create the databases

```bash
psql -U postgres -c "CREATE DATABASE due;"
psql -U postgres -c "CREATE DATABASE due_test;"
```

### 2. Set up and start the API

```bash
cd server
npm install
cp .env.example .env        # then edit .env
npm run migrate:up          # create tables in the dev database
npm run migrate:test        # create tables in the test database
npm run dev                 # http://localhost:4000
```

`server/.env`:

| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `4000` | |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/due` | |
| `TEST_DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/due_test` | Only needed to run the tests |
| `JWT_SECRET` | 64+ random characters | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | `http://localhost:5173` | The one origin CORS allows |
| `LOG_LEVEL` | `info` | |

Check it: http://localhost:4000/api/health should return `{"status":"ok","db":"ok"}`.

### 3. Start the client

```bash
cd client
npm install
echo API_PROXY_TARGET=http://localhost:4000 > .env.local
npm run dev                 # http://localhost:5173
```

In development, Vite forwards `/api` to `API_PROXY_TARGET`. If you leave it unset, the client talks to the **deployed** API. `npm run build` uses `client/.env.production`, which points at the deployed API.

### 4. Run the tests

From the repository root, with the test database migrated:

```bash
npm install
npm test
```

The tests empty the test database before each suite, so `TEST_DATABASE_URL` must never point at real data.

## Server scripts (`server/`)

| Script | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload |
| `npm start` | Start the API |
| `npm run migrate:up` / `migrate:down` | Apply / roll back migrations using `server/.env` |
| `npm run migrate:test` | Apply migrations to `TEST_DATABASE_URL` |
| `npm run migrate:prod` | Apply migrations using `DATABASE_URL` from the environment (used on Render) |

## Documentation

- [API reference](docs/api.md): every endpoint, request, response and error code.
- [Architecture](docs/architecture.md): request flow, data model, money splitting, balances and debt simplification, testing.
- [Deployment](docs/deployment.md): Render setup and environment variables.

## Team

Built as a college project (2026) by [Amaan](https://github.com/Amaan0907) and [Nandini Yadav](https://github.com/nandiniyadaventer05-gif).
