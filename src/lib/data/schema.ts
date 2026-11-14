/** User data. Finance rows are typed; other tabs are filled in by later modules. */
import type { CategoryLimit, ExpenseEntry, IncomeEntry, PlannedExpense, PlannedIncome } from "../finance/model.ts";

export type DataRecord = {
  id: string;
  updatedAt: string;
  deleted?: boolean;
};

export type SalaryRecord = DataRecord & { amount: number; currency: "SAR" };

export type UserData = {
  v: 1;
  finance: {
    salary: SalaryRecord | null;
    /** Jobs and promised money; see PlannedIncome. Not received money. */
    plannedIncome: PlannedIncome[];
    income: IncomeEntry[];
    expense: ExpenseEntry[];
    plannedExpense: PlannedExpense[];
    limits: CategoryLimit[];
  };
  work: { tasks: DataRecord[] };
  visa: { entries: DataRecord[] };
  diary: { items: DataRecord[] };
  sport: { sessions: DataRecord[] };
  plans: { items: DataRecord[] };
};

export function emptyUserData(): UserData {
  return {
    v: 1,
    finance: { salary: null, plannedIncome: [], income: [], expense: [], plannedExpense: [], limits: [] },
    work: { tasks: [] },
    visa: { entries: [] },
    diary: { items: [] },
    sport: { sessions: [] },
    plans: { items: [] },
  };
}
