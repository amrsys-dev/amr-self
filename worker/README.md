# AMR ID preview worker

Preview worker `amr-id-do-preview` coordinates nick uniqueness, If-Match
version writes, and in-memory rate limits. It also binds the `amr-id-preview`
KV namespace and the EU `amr-id-preview` R2 bucket. The Vercel app talks only
to this worker with `CF_DO_URL` and `CF_DO_SECRET`. Do not put a Cloudflare
API token on Vercel.

Rate-limit keys are not written to Durable Object storage or to KV. KV and R2
writes happen only when the value actually changes. Public business cards are
cached with the Workers Cache API (30s, stale-while-revalidate 120s).

The OTP relay in `src/index.ts` is **not deployed** with this worker.

## Env

- `CF_DO_SECRET` — shared bearer token (`wrangler secret put CF_DO_SECRET`)

Production stays unset until Murad writes «выкатывай».

## Endpoints

`POST /v1/do` with `{ op, ... }` and `Authorization: Bearer <CF_DO_SECRET>`.
Ops: `get`, `put`, `delete`, `list`, `cas`, `ratelimit`, `blob-get`,
`blob-put`, `blob-delete`, `blob-list`.

`GET /v1/card/:nick` (same bearer) returns the public card and is cached.

Create the Durable Object with `locationHint = "weur"` (SQLite-backed class).
The R2 bucket uses `jurisdiction = "eu"`.
