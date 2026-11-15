import { createFileRoute } from "@tanstack/react-router";
import { CURRENCIES, FALLBACK_RATES, type Currency, type Rates } from "@/lib/finance/currency.ts";

let cached: { at: number; body: Rates } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

/** Exchange rates per 1 USD for the five app currencies, refreshed every 6 hours. */
async function loadRates(): Promise<Rates> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.body;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const json = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (json.result !== "success" || !json.rates) throw new Error("rates");
    const rates = {} as Record<Currency, number>;
    for (const c of CURRENCIES) rates[c] = Number(json.rates[c]) || FALLBACK_RATES[c];
    const body: Rates = { rates, updated: json.time_last_update_utc ?? new Date().toISOString() };
    cached = { at: Date.now(), body };
    return body;
  } catch {
    return cached?.body ?? { rates: FALLBACK_RATES, updated: "", approx: true };
  }
}

export const Route = createFileRoute("/api/rates")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(await loadRates(), {
          headers: { "cache-control": "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400" },
        }),
    },
  },
});
