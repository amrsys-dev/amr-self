/**
 * Display currency and conversion. Every record keeps the currency it was entered in;
 * screens show everything converted to the chosen currency at the latest known rate.
 */
export const CURRENCIES = ["SAR", "USD", "RUB", "UZS", "TJS"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Units per 1 USD. Used until live rates arrive (and if they cannot be fetched). */
export const FALLBACK_RATES: Record<Currency, number> = { SAR: 3.75, USD: 1, RUB: 80, UZS: 12500, TJS: 10 };

export type Rates = { rates: Record<Currency, number>; updated: string; approx?: boolean };

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** Records without a currency were entered before currencies existed: they are SAR. */
export function convert(amount: number, from: string | undefined, to: Currency, rates: Record<Currency, number>): number {
  const src = isCurrency(from) ? from : "SAR";
  if (!Number.isFinite(amount)) return 0;
  if (src === to) return amount;
  const usd = amount / (rates[src] || FALLBACK_RATES[src]);
  return Math.round(usd * (rates[to] || FALLBACK_RATES[to]) * 100) / 100;
}

/** Short sign shown next to amounts. SAR uses the riyal sign (drawn by CSS), so it has no text. */
export const SIGN: Record<Currency, { text: string; before: boolean }> = {
  SAR: { text: "", before: true },
  USD: { text: "$", before: true },
  RUB: { text: "₽", before: false },
  UZS: { text: "сўм", before: false },
  TJS: { text: "SM", before: false },
};

/** "15", "15 000", "15 000.50": decimals only when there are any, thin space between thousands. */
export function formatNumber(n: number): string {
  const neg = n < 0;
  const abs = Math.round(Math.abs(n) * 100) / 100;
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "−" : "") + grouped + (cents ? "." + String(cents).padStart(2, "0") : "");
}

/** Amount typed by the user: accepts "15", "15.5", "15,50", "15 000". */
export function parseAmount(raw: string): number {
  const v = Number(raw.replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}
