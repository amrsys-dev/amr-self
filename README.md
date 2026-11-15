# SELF

SELF is a standalone personal life-management PWA. It combines daily planning, personal finance, health tracking, and digital identity in one private workspace.

## Current MVP scope

- Existing account registration, login, Telegram one-time codes, recovery codes, and public digital card.
- Today dashboard with monthly income/expenses, task progress, and water tracking.
- Personal income and expense entries in SAR.
- Tasks with due dates, priorities, completion, and deletion.
- Basic health logs: water, weight, meals/calories, and workouts.
- Existing encrypted local data store and background synchronization.
- RU / AR (RTL) / UZ / TJ / EN interface language support.
- PWA shell and responsive mobile-first interface.

## Deliberately not enabled yet

- Vault/password manager: no secrets are stored by this MVP. A dedicated local-only encryption design, auto-lock, and security review are required first.
- Medical diagnosis, clinical scoring, or health recommendations.
- Automatic bank integrations, payment processing, or financial advice.
- Advanced nutrition databases, wearable integrations, and automated fitness plans.
- Full budgeting, debts, recurring transactions, and financial forecasting.

## Stack

TanStack Start, React, TypeScript, Vite, Nitro on Vercel. Personal data is encrypted on the client before it is stored or synchronized. The random data-file key is wrapped with password/recovery material using Argon2id and HKDF. Data blobs use XChaCha20-Poly1305 with account/version AAD. The existing encrypted IndexedDB and remote sync path remain the persistence layer.

## Local development

```bash
cp .env.example .env
# set SESSION_SECRET to a long random string
npm install
npm test
npm run typecheck
npm run dev
```

With `OTP_MODE=test` locally and no worker relay, a one-time code appears only in a clearly marked test banner and server log. Production never exposes this test code.

## Release policy

Preview only until explicitly approved. Do not run a production deployment, attach DNS, or configure a custom domain until the owner explicitly authorizes release.
