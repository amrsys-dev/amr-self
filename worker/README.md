# AMR ID preview worker

Preview worker `amr-id-do-preview` coordinates nick uniqueness, If-Match
version writes, and in-memory rate limits. It also binds the `amr-id-preview`
KV namespace and the EU `amr-id-preview` R2 bucket. The Vercel app talks only
to this worker with `CF_DO_URL` and `CF_DO_SECRET`. Do not put a Cloudflare
API token on Vercel.

Rate-limit keys are not written to Durable Object storage or to KV. KV and R2
writes happen only when the value actually changes. Public business cards are
cached with the Workers Cache API (30s, stale-while-revalidate 120s).

This worker also hosts `@amr_id_bot`: `POST /v1/otp/send` (bearer `CF_DO_SECRET`)
and `POST /v1/tg/webhook` (Telegram `secret_token` header). The bot token is a
worker secret (`TG_OTP_BOT_TOKEN`); do not put it on Vercel. Webhook secret:
`TG_WEBHOOK_SECRET`. Codes are sent only to a stored numeric `chat_id`.
The older standalone relay in `src/index.ts` is not deployed.

## Env

- `CF_DO_SECRET` — shared bearer token (`wrangler secret put CF_DO_SECRET`)
- `TG_OTP_BOT_TOKEN` — Telegram bot token (worker secret only)
- `TG_WEBHOOK_SECRET` — webhook `secret_token` (worker secret only)

Production stays unset until Murad writes «выкатывай».

## Endpoints

`POST /v1/do` with `{ op, ... }` and `Authorization: Bearer <CF_DO_SECRET>`.
Ops: `get`, `put`, `delete`, `list`, `cas`, `ratelimit`, `blob-get`,
`blob-put`, `blob-delete`, `blob-list`.

`GET /v1/card/:nick` (same bearer) returns the public card and is cached.

`POST /v1/otp/send` with `{ chatId, text, lang }` and the same bearer. Rate-limited
in the Durable Object (5 / 15 min per chat).

`POST /v1/tg/webhook` is called by Telegram. It is not authenticated with
`CF_DO_SECRET`; it checks `X-Telegram-Bot-Api-Secret-Token`.

Create the Durable Object with `locationHint = "weur"` (SQLite-backed class).
The R2 bucket uses `jurisdiction = "eu"`.


## Production worker (not deployed)

`wrangler.prod.toml` describes a separate worker named `amr-id-do`, with its
own secret, KV namespace, and EU R2 bucket `amr-id-prod`. Do not deploy it
and do not reuse `amr-id-do-preview` bindings or secrets, until Murad writes
«выкатывай» in the IT DM.
