# Deploying Splitly

The API and its PostgreSQL database run on **Render**. The live API is at `https://splitly-0qy4.onrender.com`, and `/api/health` should return `{"status":"ok","db":"ok"}`.

## 1. Database

1. In Render, choose **New → Postgres**.
2. Pick the same region you'll use for the API (Singapore is closest to India).
3. When it's ready, copy its **Internal Database URL**. The API uses that one.

Free Render databases expire 30 days after creation. For a longer-lived free database, use Neon, and add `?sslmode=require` to its connection URL.

## 2. API (web service)

Choose **New → Web Service** and connect the GitHub repository.

| Setting | Value |
|---|---|
| Branch | `main` |
| Root Directory | `server` |
| Runtime | Node (the version comes from `engines` in `server/package.json`: 22.x) |
| Build Command | `npm ci --include=dev` |
| Start Command | `npm run migrate:prod && npm start` |
| Health Check Path | `/api/health` |

- **Why `--include=dev`:** `node-pg-migrate` is a dev dependency, and `NODE_ENV=production` would otherwise skip it.
- **Why migrations run in the start command:** the free plan has no pre-deploy step. Migrations that have already run are skipped, so running them on every start is harmless.

### Environment variables

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Internal Database URL from step 1 |
| `JWT_SECRET` | a new random secret, at least 32 characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CLIENT_ORIGIN` | the web client's exact origin, e.g. `https://splitly.vercel.app` (no trailing slash) |
| `LOG_LEVEL` | `info` |

Don't set `PORT` (Render provides it), and don't set `TEST_DATABASE_URL`, which is only needed by the tests. Never reuse the `JWT_SECRET` from your local `.env`.

### Production behaviour that depends on these settings

- **Cookies** are `Secure; SameSite=None`, so a client on another domain can send them. Safari blocks cookies from another site by default, so use Chrome or Edge for demos, or serve the client from the same site as the API.
- **`trust proxy`** is set to 1, so the login rate limiter sees each visitor's real IP rather than Render's proxy.
- **Cold starts:** free instances sleep after 15 minutes without traffic, and the next request takes about 50 seconds. Open `/api/health` shortly before a demo.

## 3. Web client

The client is a static Vite build:

```bash
cd client
npm ci
npm run build      # output in client/dist
```

- **API address:** `client/.env.production` sets `VITE_API_URL=https://splitly-0qy4.onrender.com` (the API origin, without `/api`).
- **Where to host it:** any static host works: Render Static Site, Vercel or Netlify.
  - Use `client` as the root directory, `npm run build` as the build command and `dist` as the output folder.
  - Add a rewrite of `/*` to `/index.html`, so links like `/groups/7` load the app instead of a 404.
- **After deploying:** set the API's `CLIENT_ORIGIN` to the client's URL and redeploy the API.

## 4. Looking at production data

On the Render database page, open **Connect → External** and copy the PSQL command, then run it locally:

```sql
SELECT id, name, email, created_at FROM users ORDER BY id;
```

Leave `password_hash` out of queries you share. The production database only contains users who registered through the deployed app; local test users are not there.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| The deploy exits with "Invalid environment variables" | A variable is missing or malformed. The log names it. |
| `/api/health` returns `"db":"unreachable"` | Wrong `DATABASE_URL`, or the database is in another region (the internal URL only works within the same region) |
| CORS errors in the browser | `CLIENT_ORIGIN` doesn't exactly match the client's origin |
| Login works but the next request is `401` | The cookie was blocked: check the API is on HTTPS and the browser allows cookies from other sites (Safari blocks them by default) |
| `429 RATE_LIMITED` while testing | More than 10 login/register attempts in 15 minutes from one IP |
