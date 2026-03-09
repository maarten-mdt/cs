# MDT Support Platform — Railway Setup

## 1. Railway services needed

- **Web** — The Node.js backend (this repo). Set the **root directory** to `backend` so that `npm run build` and `node dist/index.js` run from the backend folder.
- **PostgreSQL** — Add the PostgreSQL plugin to your project. Railway will set `DATABASE_URL` automatically.
- **Redis** — Add the Redis plugin (or use Redis Cloud / Upstash). Set `REDIS_URL` in the Web service to the connection string (e.g. `redis://default:password@host:port`).

Optional: run the **sync worker** as a separate service (same codebase, start command `npm run worker:prod` or `node dist/workers/sync.worker.js`) so that source sync and conversation-end jobs are processed. If you don’t run a worker, the API still works but sync jobs won’t run until a worker is running.

---

## 2. Environment variables

Set these in the Railway **Web** service (and in the worker service if you run one). Copy from `env.example` and fill in values.

| Variable | Where to get it |
|----------|-----------------|
| `DATABASE_URL` | Set automatically by PostgreSQL plugin (or copy from plugin variables). |
| `REDIS_URL` | From Redis plugin or your Redis provider (e.g. Redis Cloud, Upstash). Format: `redis://default:password@host:port`. |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32`. Use a long random string (≥ 32 chars). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID. |
| `ALLOWED_EMAIL_DOMAIN` | Your company domain, e.g. `mdttac.com`. Only this domain can sign in. |
| `AUTH_CALLBACK_URL` | Must match Google Console. Production: `https://YOUR-RAILWAY-URL/auth/google/callback`. |
| `FRONTEND_URL` | URL where the admin dashboard is served (e.g. `https://your-app.railway.app` if same as backend, or your Vercel URL). |
| `PUBLIC_URL` | URL where the public chat is served (often same as backend). |
| `ANTHROPIC_API_KEY` | From Anthropic console. |
| `OPENAI_API_KEY` | From OpenAI (for embeddings and knowledge search). |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_ACCESS_TOKEN` | Optional; for order lookup and Shopify product sync. |
| `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` | Optional; for help center sync and escalation. |
| `CRAWLER_USER_AGENT` | Optional; set and whitelist in Cloudflare WAF if the crawler is blocked. |

You can also configure many of these from the **Connections** page in the admin after first deploy (stored in DB).

---

## 3. Run the first migration on Railway

After the Web service is deployed and `DATABASE_URL` is set:

1. In Railway, open your **Web** service.
2. Go to **Settings** or use the **CLI**.
3. Run the migration from your machine with the production DB URL, or use a one-off command in Railway:

- **From your machine** (with `DATABASE_URL` set to the Railway Postgres URL):
  ```bash
  cd backend && npm run db:migrate
  ```
- **Railway one-off** (if your build includes migrations): ensure `db:migrate` runs in the build or run a separate “migrate” command from the Railway dashboard using the same `DATABASE_URL`.

If you use `run-migrate.mjs`, point it at the production `DATABASE_URL` when running the first time.

---

## 4. CRAWLER_USER_AGENT and Cloudflare WAF

If the **website crawler** is blocked (403 or timeouts):

1. In `.env` (or Connections / env vars), set **CRAWLER_USER_AGENT** to a unique string, e.g. `MDT-Crawler-your-secret-token`.
2. In your Cloudflare dashboard (if the site is behind Cloudflare), go to **Security** → **WAF** (or **Tools** → **WAF**) and add a rule or allowlist so that requests with this `User-Agent` are allowed.

---

## 5. Configure connections after first deploy

1. Open the admin dashboard (e.g. `https://your-app.railway.app/admin`).
2. Sign in with Google (ensure your email domain is in `ALLOWED_EMAIL_DOMAIN`).
3. Go to **Connections** and enter credentials for Shopify, Zendesk, HubSpot, Anthropic, etc. These are stored in the database and used by the API.
4. Use **Test connection** on each integration to confirm credentials work; the UI shows the exact error if a test fails.

---

## Health check

- **GET /health** — Returns `{ status: 'ok', timestamp, version }`. Use this for Railway (or any platform) health checks and monitoring.

---

## Security checklist

- [ ] `SESSION_SECRET` is at least 32 random characters.
- [ ] `ANTHROPIC_API_KEY` (and other secrets) are only in env or Connections DB, never in the frontend build.
- [ ] All `/api/admin/*` routes return 401 without a valid session.
- [ ] Stack traces never appear in HTTP responses (production error handler returns a generic message).
- [ ] CORS is restricted to `FRONTEND_URL` and `PUBLIC_URL` in production.
- [ ] Rate limiter returns 429 after 20 chat requests per minute per IP.
