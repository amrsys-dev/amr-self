/** Empty tab schema for stage 1. Content arrives in later PRs. */
export type UserData = {
  v: 1;
  finance: {
    salary: null | { amount: number; currency: "SAR" };
    gigs: unknown[];
    income: unknown[];
    expense: unknown[];
    planned: unknown[];
    limits: unknown[];
  };
  work: { tasks: unknown[] };
  visa: { entries: unknown[] };
  diary: { items: unknown[] };
  sport: { sessions: unknown[] };
  plans: { items: unknown[] };
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
