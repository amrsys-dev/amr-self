/** Monthly bills (rent, electricity, phone): what is due, when, and one tap to pay. */
import { useState } from "react";
import type { FinanceRecord, UserData } from "@/lib/data/schema.ts";
import { billState, EXPENSE_CATEGORIES, type BillRecord, type ExpenseCategory } from "@/lib/finance/categories.ts";
import type { Lang } from "@/lib/i18n.ts";
import { tx } from "./extra-copy.ts";
import { CategoryIcon, CategoryPicker, makeId, nowIso, todayKey } from "./parts.tsx";

type Props = {
  data: UserData;
  persist: (next: UserData) => Promise<void>;
  lang: Lang;
  money: (n: number) => string;
  labels: { save: string; cancel: string; amount: string; delete: string };
};

export function BillsCard({ data, persist, lang, money, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [category, setCategory] = useState<ExpenseCategory>("housing");
  const today = todayKey();
  const bills = (data.finance.planned ?? []).filter((b) => !b.deleted && typeof b.title === "string");
  const rows = bills
    .map((bill) => ({ bill, s: billState(bill, today) }))
    .sort((a, b) => Number(a.s.paid) - Number(b.s.paid) || a.s.daysLeft - b.s.daysLeft);

  async function add() {
    const value = Number(amount.replace(",", "."));
    const d = Number(day);
    if (!title.trim() || !Number.isFinite(value) || value <= 0 || !(d >= 1 && d <= 31)) return;
    const bill: BillRecord = { id: makeId(), updatedAt: nowIso(), title: title.trim(), category, amount: value, dayOfMonth: Math.round(d), paidMonths: [] };
    await persist({ ...data, finance: { ...data.finance, planned: [...data.finance.planned, bill] } });
    setOpen(false);
    setTitle("");
    setAmount("");
    setDay("1");
  }

  async function pay(bill: BillRecord) {
    const now = nowIso();
    const expense: FinanceRecord = { id: makeId(), updatedAt: now, title: bill.title, amount: bill.amount, currency: "SAR", category: bill.category, date: today };
    const updated: BillRecord = { ...bill, updatedAt: now, paidMonths: [...bill.paidMonths, today.slice(0, 7)] };
    await persist({
      ...data,
      finance: {
        ...data.finance,
        expense: [...data.finance.expense, expense],
        planned: data.finance.planned.map((b) => (b.id === bill.id ? updated : b)),
      },
    });
  }

  async function remove(bill: BillRecord) {
    const gone = { ...bill, deleted: true, updatedAt: nowIso() };
    await persist({ ...data, finance: { ...data.finance, planned: data.finance.planned.map((b) => (b.id === bill.id ? gone : b)) } });
  }

  function statusText(s: ReturnType<typeof billState>) {
    if (s.paid) return tx(lang, "paid");
    if (s.status === "overdue") return tx(lang, "overdue");
    if (s.daysLeft === 0) return tx(lang, "dueToday");
    return tx(lang, "dueIn", { n: s.daysLeft });
  }

  return (
    <>
      <div className="self-section-head">
        <h3>{tx(lang, "bills")}</h3>
        <button type="button" className="self-add" onClick={() => setOpen(true)} aria-label={tx(lang, "addBill")}>+ {tx(lang, "add")}</button>
      </div>
      {rows.length > 0 && <div className="self-card">
        {rows.map(({ bill, s }) => (
          <div className="self-list-row" key={bill.id}>
            <div className="self-list-mark"><CategoryIcon c={bill.category} /></div>
            <div className="self-list-copy">
              <b>{bill.title}</b>
              <small>{money(bill.amount)} · {tx(lang, "everyMonth", { d: bill.dayOfMonth })}</small>
            </div>
            {s.paid ? (
              <span className="self-pill ok">{statusText(s)}</span>
            ) : (
              <div className="self-bill-actions">
                <span className={`self-pill ${s.status}`}>{statusText(s)}</span>
                <button type="button" className="self-pay" onClick={() => void pay(bill)}>{tx(lang, "markPaid")}</button>
              </div>
            )}
            <button className="self-delete" type="button" onClick={() => void remove(bill)} aria-label={labels.delete}>×</button>
          </div>
        ))}
      </div>}

      {open && (
        <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <section className="self-modal" role="dialog" aria-modal="true" aria-label={tx(lang, "addBill")}>
            <div className="self-modal-head"><h3>{tx(lang, "addBill")}</h3><button type="button" onClick={() => setOpen(false)} aria-label={labels.cancel}>×</button></div>
            <label>{tx(lang, "billTitle")}<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>{labels.amount} (SAR)<input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>{tx(lang, "payDay")}<input type="number" min="1" max="31" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} /></label>
            <CategoryPicker options={EXPENSE_CATEGORIES} value={category} onChange={(v) => setCategory(v as ExpenseCategory)} lang={lang} label={tx(lang, "byCategory")} />
            <div className="self-modal-actions">
              <button type="button" className="self-secondary" onClick={() => setOpen(false)}>{labels.cancel}</button>
              <button type="button" className="self-primary" onClick={() => void add()}>{labels.save}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/** Unpaid bills of this month, for the Today screen. */
export function dueBillsTotal(data: UserData): { count: number; amount: number } {
  const today = todayKey();
  let count = 0;
  let amount = 0;
  for (const b of data.finance.planned ?? []) {
    if (b.deleted || typeof b.title !== "string") continue;
    if (!billState(b, today).paid) {
      count += 1;
      amount += b.amount;
    }
  }
  return { count, amount };
}
