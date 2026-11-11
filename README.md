# AMR ID

Personal assistant and digital ID. Separate from Safar.

Stage 1 is a preview skeleton: sign-up, password + one-time code, a public business card, and empty tabs. Nothing is in production, and no custom domain is attached.

## Stack

TanStack Start, React, TypeScript, Vite, Nitro on Vercel — the same family as the Safar hub. The data-file key is random and wrapped twice (password and recovery code) with argon2id then HKDF; the server only ever sees a derived auth key. Blobs are XChaCha20-Poly1305 with AAD = account id + version. Test storage is a local file (or in-memory on a preview). Preview can use Cloudflare KV plus a Durable Object for nick uniqueness and If-Match writes; R2 stays off until a bucket is enabled. Public business cards are cached at the edge for 30 seconds (stale-while-revalidate 120).

## Local

```bash
cp .env.example .env
# set SESSION_SECRET to a long random string
npm install
npm test
npm run typecheck
npm run dev
```

With `OTP_MODE=test` (the default outside production) a one-time code appears in a clearly marked test banner and in the server log. That never runs when `VERCEL_ENV=production`.

## Nick

Default format is `@AMR-xxx-xxx`. Set `AMR_NICK_FORMAT=xxxx-xxxx` to switch to `@AMR-xxxx-xxxx`. Retired nicks are never reissued. A nick may be changed exactly once. Sign-up issues `AMR_RECOVERY_CODES` (default 10) one-time recovery codes, generated on the device and shown once — never sent to the server or Telegram. Support cannot reset a password. Login codes go only through the Telegram bot until a domain is approved (`AMR_OTP_EMAIL=false`). Logs are kept 30 days, reports 90 days; «delete everything» wipes immediately (provider backups may remain up to 30 days).

## Preview only

Deploy with `vercel deploy` (no `--prod`). Do not attach DNS or a custom domain until Murad writes «выкатывай» in the IT private chat.
