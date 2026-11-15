/**
 * Chosen display currency (kept on this device) and the latest exchange rates.
 * Profile and Finance share it through a window event.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { convert, CURRENCIES, FALLBACK_RATES, formatNumber, isCurrency, SIGN, type Currency, type Rates } from "@/lib/finance/currency.ts";

const CUR_KEY = "self.currency";
const RATES_KEY = "self.rates";
const EVT = "self-currency";

function readCur(): Currency {
  try {
    const v = localStorage.getItem(CUR_KEY);
    if (isCurrency(v)) return v;
  } catch { /* storage unavailable */ }
  return "SAR";
}

function readRates(): Record<Currency, number> {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (raw) return { ...FALLBACK_RATES, ...(JSON.parse(raw) as Rates).rates };
  } catch { /* ignore */ }
  return FALLBACK_RATES;
}

export function setCurrency(c: Currency) {
  try {
    localStorage.setItem(CUR_KEY, c);
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

export function useCurrency() {
  const [cur, setCur] = useState<Currency>("SAR");
  const [rates, setRates] = useState<Record<Currency, number>>(FALLBACK_RATES);
  useEffect(() => {
    setCur(readCur());
    setRates(readRates());
    const on = () => setCur(readCur());
    window.addEventListener(EVT, on);
    fetch("/api/rates")
      .then((r) => r.json() as Promise<Rates>)
      .then((r) => {
        if (r.approx) return;
        setRates({ ...FALLBACK_RATES, ...r.rates });
        try {
          localStorage.setItem(RATES_KEY, JSON.stringify(r));
        } catch { /* ignore */ }
      })
      .catch(() => undefined);
    return () => window.removeEventListener(EVT, on);
  }, []);
  /** Amount entered in `from` shown in the chosen currency. */
  const toCur = useCallback((n: number, from?: string) => convert(n, from, cur, rates), [cur, rates]);
  const money = useCallback((n: number): ReactNode => <Money n={n} cur={cur} />, [cur]);
  return { cur, setCur: setCurrency, toCur, money, currencies: CURRENCIES };
}

export function CurrencySign({ cur }: { cur: Currency }) {
  if (cur === "SAR") return <i className="riyal" role="img" aria-label="SAR" />;
  return <>{SIGN[cur].text}</>;
}

export function Money({ n, cur }: { n: number; cur: Currency }) {
  const s = SIGN[cur];
  return (
    <span className="money">
      {s.before ? <CurrencySign cur={cur} /> : null}
      {formatNumber(n)}
      {!s.before ? <>{" "}<CurrencySign cur={cur} /></> : null}
    </span>
  );
}
