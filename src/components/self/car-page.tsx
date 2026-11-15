/**
 * Car upkeep: current mileage, each replacement with "km left", one tap to
 * record a replacement (its cost goes to Finance as a car expense).
 */
import type { ReactNode } from "react";
import { parseAmount } from "@/lib/finance/currency.ts";
import { useState } from "react";
import {
  DEFAULT_INTERVAL_KM,
  isOdometerRollback,
  itemState,
  MAINTENANCE_KINDS,
  parseKm,
  type CarProfile,
  type MaintenanceItem,
  type MaintenanceKind,
  type ServiceEntry,
} from "@/lib/car/maintenance.ts";
import { emptyUserData, type FinanceRecord, type UserData } from "@/lib/data/schema.ts";
import type { Lang } from "@/lib/i18n.ts";
import { formatKm, tx } from "./extra-copy.ts";
import { makeId, nowIso, todayKey } from "./parts.tsx";

type Props = {
  data: UserData;
  persist: (next: UserData) => Promise<void>;
  lang: Lang;
  money: (n: number, from?: string) => ReactNode;
  toCur: (n: number, from?: string) => number;
  cur: string;
  labels: { save: string; cancel: string; delete: string; back: string };
  onBack: () => void;
};

type Modal = { kind: "car" } | { kind: "odometer" } | { kind: "item" } | { kind: "done"; item: MaintenanceItem } | null;

export function carOf(data: UserData) {
  const car = data.car ?? emptyUserData().car!;
  const vehicle = car.vehicles.find((v) => !v.deleted) ?? null;
  return { car, vehicle, items: car.items.filter((i) => !i.deleted) };
}

export function itemName(lang: Lang, item: Pick<MaintenanceItem, "kind" | "title">) {
  return item.kind === "custom" && item.title ? item.title : tx(lang, item.kind);
}

export function CarPage({ data, persist, lang, money, toCur, cur, labels, onBack }: Props) {
  const { car, vehicle, items } = carOf(data);
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState("");
  const [km, setKm] = useState("");
  const [intervalKm, setIntervalKm] = useState(String(DEFAULT_INTERVAL_KM.engine_oil));
  const [kind, setKind] = useState<MaintenanceKind>("engine_oil");
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const today = todayKey();
  const odometer = vehicle?.odometer ?? 0;
  const month = today.slice(0, 7);
  const carSpend = data.finance.expense
    .filter((r) => !r.deleted && (r.date ?? "").startsWith(month) && (r.category === "car" || r.category === "fuel" || r.category === "transport"))
    .reduce((n, r) => n + toCur(Number.isFinite(r.amount) ? Number(r.amount) : 0, r.currency), 0);

  function open(next: Modal) {
    setError("");
    setCost("");
    setTitle("");
    if (next?.kind === "car") { setName(""); setKm(""); }
    if (next?.kind === "odometer") setKm(vehicle ? String(vehicle.odometer) : "");
    if (next?.kind === "item") { setKind("engine_oil"); setIntervalKm(String(DEFAULT_INTERVAL_KM.engine_oil)); setKm(String(odometer)); }
    if (next?.kind === "done") setKm(String(odometer));
    setModal(next);
  }

  const withCar = (patch: Partial<NonNullable<UserData["car"]>>): UserData => ({ ...data, car: { ...car, ...patch } });

  async function save() {
    const now = nowIso();
    if (modal?.kind === "car") {
      const value = parseKm(km);
      if (!name.trim() || value === null) return setError(tx(lang, "badNumber"));
      const v: CarProfile = { id: makeId(), updatedAt: now, name: name.trim(), odometer: value, odometerDate: today };
      await persist(withCar({ vehicles: [...car.vehicles, v] }));
    } else if (modal?.kind === "odometer" && vehicle) {
      const value = parseKm(km);
      if (value === null) return setError(tx(lang, "badNumber"));
      if (isOdometerRollback(vehicle.odometer, value)) return setError(tx(lang, "rollback"));
      const v = { ...vehicle, odometer: value, odometerDate: today, updatedAt: now };
      await persist(withCar({ vehicles: car.vehicles.map((x) => (x.id === v.id ? v : x)) }));
    } else if (modal?.kind === "item") {
      const last = parseKm(km);
      const every = parseKm(intervalKm);
      if (last === null || every === null || every === 0) return setError(tx(lang, "badNumber"));
      const item: MaintenanceItem = { id: makeId(), updatedAt: now, kind, title: kind === "custom" ? title.trim() || undefined : undefined, intervalKm: every, lastKm: last, lastDate: today };
      await persist(withCar({ items: [...car.items, item] }));
    } else if (modal?.kind === "done") {
      const at = parseKm(km);
      if (at === null) return setError(tx(lang, "badNumber"));
      const price = cost.trim() ? parseAmount(cost) || 0 : 0;
      const item = { ...modal.item, lastKm: at, lastDate: today, updatedAt: now };
      const expense: FinanceRecord | null = price > 0
        ? { id: makeId(), updatedAt: now, title: itemName(lang, item), amount: price, currency: cur, category: "car", date: today }
        : null;
      const entry: ServiceEntry = { id: makeId(), updatedAt: now, itemId: item.id, kind: item.kind, km: at, date: today, cost: price || undefined, currency: cur, expenseId: expense?.id };
      const vehicles = vehicle && at > vehicle.odometer
        ? car.vehicles.map((x) => (x.id === vehicle.id ? { ...vehicle, odometer: at, odometerDate: today, updatedAt: now } : x))
        : car.vehicles;
      await persist({
        ...withCar({ vehicles, items: car.items.map((x) => (x.id === item.id ? item : x)), log: [...car.log, entry] }),
        finance: expense ? { ...data.finance, expense: [...data.finance.expense, expense] } : data.finance,
      });
    }
    setModal(null);
  }

  async function removeItem(item: MaintenanceItem) {
    await persist(withCar({ items: car.items.map((x) => (x.id === item.id ? { ...x, deleted: true, updatedAt: nowIso() } : x)) }));
  }

  const sorted = items
    .map((item) => ({ item, s: itemState(item, odometer) }))
    .sort((a, b) => a.s.leftKm - b.s.leftKm);
  const history = car.log.filter((e) => !e.deleted).slice().sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);

  return (
    <>
      <button className="self-back" type="button" onClick={onBack}>‹ {labels.back}</button>
      <h2 className="self-page-title">{tx(lang, "car")}</h2>

      {!vehicle ? (
        <div className="self-card self-vault-note">
          <p>{tx(lang, "setupCar")}</p>
          <button type="button" className="self-primary" onClick={() => open({ kind: "car" })}>{tx(lang, "addCar")}</button>
        </div>
      ) : (
        <>
          <div className="self-card self-balance self-odo">
            <div>
              <span>{vehicle.name} · {tx(lang, "odometer")}</span>
              <strong>{formatKm(vehicle.odometer)} <small>{tx(lang, "km")}</small></strong>
              <small>{tx(lang, "updated", { date: new Date(vehicle.odometerDate + "T12:00:00").toLocaleDateString() })}</small>
            </div>
            <button type="button" className="self-primary" onClick={() => open({ kind: "odometer" })}>{tx(lang, "updateOdometer")}</button>
          </div>

          <div className="self-section-head">
            <h3>{tx(lang, "maintenance")}</h3>
            <button type="button" onClick={() => open({ kind: "item" })}>+ {tx(lang, "addItem")}</button>
          </div>
          <div className="self-card">
            {sorted.length === 0 ? <div className="self-empty">{tx(lang, "noItems")}</div> : sorted.map(({ item, s }) => (
              <div className={`self-maint ${s.status}`} key={item.id}>
                <div className="self-maint-top">
                  <b>{itemName(lang, item)}</b>
                  <span className={`self-pill ${s.status}`}>
                    {s.leftKm >= 0 ? `${formatKm(s.leftKm)} ${tx(lang, "km")} ${tx(lang, "left")}` : `${tx(lang, "overdueBy")} ${formatKm(-s.leftKm)} ${tx(lang, "km")}`}
                  </span>
                </div>
                <div className="self-progress"><i style={{ width: Math.round(s.used * 100) + "%" }} /></div>
                <div className="self-maint-foot">
                  <small>{formatKm(item.lastKm)} → {tx(lang, "replaceAt", { km: formatKm(s.nextKm) })}</small>
                  <div className="self-bill-actions">
                    <button type="button" className="self-pay" onClick={() => open({ kind: "done", item })}>{tx(lang, "markDone")}</button>
                    <button className="self-delete" type="button" onClick={() => void removeItem(item)} aria-label={labels.delete}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="self-card self-inline-metrics">
            <div><span>{tx(lang, "carExpenses")}</span><b>{money(carSpend)}</b></div>
            <div><span>{tx(lang, "nextService")}</span><b>{sorted[0] ? itemName(lang, sorted[0].item) : "—"}</b></div>
          </div>

          {history.length > 0 && (
            <>
              <div className="self-section-head"><h3>{tx(lang, "history")}</h3></div>
              <div className="self-card">
                {history.map((e) => (
                  <div className="self-list-row" key={e.id}>
                    <div className="self-list-copy">
                      <b>{itemName(lang, { kind: e.kind, title: car.items.find((i) => i.id === e.itemId)?.title })}</b>
                      <small>{new Date(e.date + "T12:00:00").toLocaleDateString()} · {formatKm(e.km)} {tx(lang, "km")}</small>
                    </div>
                    {e.cost ? <strong className="expense">−{money(e.cost, e.currency)}</strong> : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {modal && (
        <div className="self-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <section className="self-modal" role="dialog" aria-modal="true">
            <div className="self-modal-head">
              <h3>{modal.kind === "car" ? tx(lang, "addCar") : modal.kind === "odometer" ? tx(lang, "updateOdometer") : modal.kind === "item" ? tx(lang, "addItem") : itemName(lang, modal.item)}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label={labels.cancel}>×</button>
            </div>
            {modal.kind === "car" && <label>{tx(lang, "carName")}<input value={name} onChange={(e) => setName(e.target.value)} /></label>}
            {modal.kind === "item" && (
              <>
                <label>{tx(lang, "itemKind")}
                  <select value={kind} onChange={(e) => { const k = e.target.value as MaintenanceKind; setKind(k); setIntervalKm(String(DEFAULT_INTERVAL_KM[k])); }}>
                    {MAINTENANCE_KINDS.map((k) => <option key={k} value={k}>{tx(lang, k)}</option>)}
                  </select>
                </label>
                {kind === "custom" && <label>{tx(lang, "customTitle")}<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>}
                <label>{tx(lang, "intervalKm")}<input inputMode="numeric" value={intervalKm} onChange={(e) => setIntervalKm(e.target.value)} /></label>
              </>
            )}
            <label>
              {modal.kind === "item" ? tx(lang, "lastKm") : tx(lang, "currentOdometer")}
              <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
            </label>
            {modal.kind === "done" && <label>{tx(lang, "cost")}<input type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>}
            {error ? <div className="self-error" role="alert">{error}</div> : null}
            <div className="self-modal-actions">
              <button type="button" className="self-secondary" onClick={() => setModal(null)}>{labels.cancel}</button>
              <button type="button" className="self-primary" onClick={() => void save()}>{labels.save}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
