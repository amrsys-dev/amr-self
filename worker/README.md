# AMR ID OTP relay (Cloudflare Worker)

This worker is the planned relay for login and contact-verification codes.
It is **not deployed** in stage 1. The Vercel app talks to Telegram or Resend
directly when those keys are present, or uses a clearly marked test OTP when they are not.

When Murad sends Cloudflare access, deploy this worker and set `OTP_RELAY_URL`
plus `OTP_RELAY_SECRET` on the Vercel project (preview first, production only
after «выкатывай»).

## Env

- `OTP_RELAY_SECRET` — shared bearer token
- `TG_OTP_BOT_TOKEN` — Telegram bot
- `RESEND_API_KEY`, `RESEND_FROM` — email

## Endpoint

`POST /send` with `{ channel, to, text }` and `Authorization: Bearer <secret>`.

## Durable Object (not deployed)

`AmrIdDo` coordinates nick uniqueness, If-Match version CAS writes, and rate limits.
The Vercel app uses it when `CF_DO_URL` and `CF_DO_SECRET` are set; otherwise it
falls back to in-memory or KV stores (preview). Do not deploy this worker until
Murad writes «выкатывай».

Create the object with `locationHint = "weur"`. R2 buckets use `jurisdiction = "eu"`.

`POST /v1/do` with `{ op, ... }` and `Authorization: Bearer <CF_DO_SECRET>`.
Ops: `get`, `put`, `delete`, `list`, `cas`, `ratelimit`.

