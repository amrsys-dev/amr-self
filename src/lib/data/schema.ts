/** Personal data model. Sensitive user data is encrypted before it leaves the device. */
import type { CarProfile, MaintenanceItem, ServiceEntry } from "../car/maintenance.ts";
import type { BillRecord } from "../finance/categories.ts";
import type { HealthConsent } from "../health/consent.ts";

export type DataRecord = {
  id: string;
  updatedAt: string;
  deleted?: boolean;
};

export type FinanceRecord = DataRecord & {
  title?: string;
  amount?: number;
  /** Currency the amount was entered in (SAR when missing). */
  currency?: string;
  category?: string;
  date?: string;
  note?: string;
  kind?: "income" | "expense";
};

export type TaskRecord = DataRecord & {
  title?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high";
  completed?: boolean;
};

export type HealthEntry = DataRecord & {
  kind?: "water" | "weight" | "meal" | "workout";
  title?: string;
  date?: string;
  amount?: number;
  unit?: string;
  calories?: number;
  note?: string;
};

export type SalaryRecord = DataRecord & { amount: number; currency: "SAR" };

export type UserData = {
  v: 1;
  finance: {
    salary: SalaryRecord | null;
    gigs: DataRecord[];
    income: FinanceRecord[];
    expense: FinanceRecord[];
    /** Monthly bills: rent, electricity, phone. */
    planned: BillRecord[];
    limits: DataRecord[];
  };
  work: { tasks: TaskRecord[] };
  visa: { entries: DataRecord[] };
  diary: { items: DataRecord[] };
  sport: { sessions: DataRecord[] };
  plans: { items: DataRecord[] };
  health?: {
    water: HealthEntry[];
    weight: HealthEntry[];
    nutrition: HealthEntry[];
    workouts: HealthEntry[];
  };
  /**
   * Explicit consent for the Health section (PDPL sensitive data), with its date.
   * Optional: older data has none, which means "not asked yet". Health entries
   * can be added only while `granted` is true.
   */
  healthConsent?: HealthConsent;
  /** Car upkeep by odometer. Optional: older data has none. */
  car?: {
    vehicles: CarProfile[];
    items: MaintenanceItem[];
    log: ServiceEntry[];
  };
};

export function emptyUserData(): UserData {
  return {
    v: 1,
    finance: { salary: null, gigs: [], income: [], expense: [], planned: [], limits: [] },
    work: { tasks: [] },
    visa: { entries: [] },
    diary: { items: [] },
    sport: { sessions: [] },
    plans: { items: [] },
    health: { water: [], weight: [], nutrition: [], workouts: [] },
    car: { vehicles: [], items: [], log: [] },
  };
}
