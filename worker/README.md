# AMR ID Durable Object (preview)

Preview worker `amr-id-do-preview` coordinates nick uniqueness, If-Match
version writes, and in-memory rate limits with a TTL. Rate-limit keys are not
written to Durable Object storage or to KV.

The OTP relay in `src/index.ts` is **not deployed** with this worker. Login
codes stay on the Vercel app until a Telegram bot token is set.

R2 is not enabled on the account yet; the R2 adapter stays inactive.

## Env

- `CF_DO_SECRET` — shared bearer token (`wrangler secret put CF_DO_SECRET`)

The Vercel preview app uses `CF_DO_URL` plus `CF_DO_SECRET`. Production stays
unset until Murad writes «выкатывай».

## Endpoint

`POST /v1/do` with `{ op, ... }` and `Authorization: Bearer <CF_DO_SECRET>`.
Ops: `get`, `put`, `delete`, `list`, `cas`, `ratelimit`.

Create the object with `locationHint = "weur"` (SQLite-backed class, free plan).
