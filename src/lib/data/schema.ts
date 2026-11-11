/** Empty tab schema for stage 1. Content arrives in later PRs. */

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
    gigs: DataRecord[];
    income: DataRecord[];
    expense: DataRecord[];
    planned: DataRecord[];
    limits: DataRecord[];
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
    finance: { salary: null, gigs: [], income: [], expense: [], planned: [], limits: [] },
    work: { tasks: [] },
    visa: { entries: [] },
    diary: { items: [] },
    sport: { sessions: [] },
    plans: { items: [] },
  };
}
