# AMR ID

Personal assistant and digital ID. Separate from Safar.

Stage 1 is a preview skeleton: sign-up, password + one-time code, a public business card, and empty tabs. Nothing is in production, and no custom domain is attached.

## Stack

TanStack Start, React, TypeScript, Vite, Nitro on Vercel — the same family as the Safar hub. User data is a small compressed and encrypted file. Test storage is a local file (or in-memory on a preview); Cloudflare KV and R2 are wired and stay off until the keys are set.

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

Default format is `@AMR-xxx-xxx`. Set `AMR_NICK_FORMAT=xxxx-xxxx` to switch to `@AMR-xxxx-xxxx`.

## Preview only

Deploy with `vercel deploy` (no `--prod`). Do not attach DNS or a custom domain until Murad writes «выкатывай» in the IT private chat.
