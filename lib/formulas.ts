// Spec §07 — business formulas. Pure functions, no I/O, money = NUMERIC(10,2).
// All money comparisons use a 0.01 tolerance.

export const MONEY_TOLERANCE = 0.01;

export type PaymentStatus = "Paid" | "Partial" | "Unpaid";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Today's date as YYYY-MM-DD in the *server's local* timezone.
 * `new Date().toISOString().slice(0, 10)` returns the UTC date, which is
 * tomorrow (in UTC+8) for most of the local day — that made fees due "today"
 * show as not-yet-due until the local evening.
 */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sum(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}

// ---------------------------------------------------------------------------
// Fee targeting: an EMPTY target set means the fee applies to EVERYONE.
// ---------------------------------------------------------------------------

export interface TargetLike {
  student_id?: number | string | null;
  year_level?: number | null;
}

export interface StudentLike {
  id: number | string;
  year_level: number;
}

export function feeAppliesToStudent(
  student: StudentLike,
  targets: TargetLike[],
): boolean {
  if (targets.length === 0) return true;
  return targets.some(
    (t) =>
      (t.student_id != null && String(t.student_id) === String(student.id)) ||
      (t.year_level != null && t.year_level === student.year_level),
  );
}

// ---------------------------------------------------------------------------
// Payment status: Paid / Partial / Unpaid (0.01 tolerance)
// ---------------------------------------------------------------------------

export function paymentStatus(paid: number, amountDue: number): PaymentStatus {
  if (paid >= amountDue - MONEY_TOLERANCE) return "Paid";
  if (paid > 0) return "Partial";
  return "Unpaid";
}

export function balanceDue(paid: number, amountDue: number): number {
  if (paymentStatus(paid, amountDue) === "Paid") return 0;
  return round2(Math.max(0, amountDue - paid));
}

// ---------------------------------------------------------------------------
// Clearance eligibility: every required fee must be Paid.
// An empty requirement list is eligible (nothing blocks the student).
// ---------------------------------------------------------------------------

export function isClearanceEligible(feeStatuses: PaymentStatus[]): boolean {
  return feeStatuses.every((s) => s === "Paid");
}

// ---------------------------------------------------------------------------
// Defaulters: unpaid/partial fees whose due date has passed.
// ---------------------------------------------------------------------------

export interface DefaulterRow {
  student: StudentLike & { full_name?: string };
  fee_id: number | string;
  fee_name: string;
  amount_due: number;
  amount_paid: number;
  due_date: string | null; // YYYY-MM-DD
}

export interface DefaulterResult {
  student: DefaulterRow["student"];
  fee_id: number | string;
  fee_name: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: PaymentStatus;
  due_date: string;
  days_overdue: number;
}

export function computeDefaulters(
  rows: DefaulterRow[],
  today: string = todayISO(),
): DefaulterResult[] {
  const out: DefaulterResult[] = [];
  for (const row of rows) {
    if (!row.due_date) continue;
    const status = paymentStatus(row.amount_paid, row.amount_due);
    if (status === "Paid") continue;
    if (row.due_date >= today) continue;
    out.push({
      student: row.student,
      fee_id: row.fee_id,
      fee_name: row.fee_name,
      amount_due: round2(row.amount_due),
      amount_paid: round2(row.amount_paid),
      balance: balanceDue(row.amount_paid, row.amount_due),
      status,
      due_date: row.due_date,
      days_overdue: daysBetween(row.due_date, today),
    });
  }
  return out.sort((a, b) => b.days_overdue - a.days_overdue);
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

// ---------------------------------------------------------------------------
// Financial report totals:
//   income = payments collected + other income
//   balance = income - expenses
// ---------------------------------------------------------------------------

export interface ReportTotals {
  total_payments: number;
  total_other_income: number;
  total_income: number;
  total_expenses: number;
  balance: number;
}

export function reportTotals(input: {
  payments: number[];
  other_income?: number[];
  expenses: number[];
}): ReportTotals {
  const total_payments = sum(input.payments);
  const total_other_income = sum(input.other_income ?? []);
  const total_expenses = sum(input.expenses);
  return {
    total_payments,
    total_other_income,
    total_income: round2(total_payments + total_other_income),
    total_expenses,
    balance: round2(total_payments + total_other_income - total_expenses),
  };
}

// ---------------------------------------------------------------------------
// Yearly balance: group every money row by academic_year.
// ---------------------------------------------------------------------------

export type LedgerKind = "payment" | "income" | "expense";

export interface LedgerRow {
  academic_year: string;
  kind: LedgerKind;
  amount: number;
}

export interface YearlyBalance {
  academic_year: string;
  total_income: number;
  total_expenses: number;
  balance: number;
}

export function yearlyBalances(rows: LedgerRow[]): YearlyBalance[] {
  const byYear = new Map<string, { income: number[]; expenses: number[] }>();
  for (const r of rows) {
    const entry = byYear.get(r.academic_year) ?? { income: [], expenses: [] };
    if (r.kind === "expense") entry.expenses.push(r.amount);
    else entry.income.push(r.amount);
    byYear.set(r.academic_year, entry);
  }
  return [...byYear.entries()]
    .map(([academic_year, e]) => {
      const total_income = sum(e.income);
      const total_expenses = sum(e.expenses);
      return {
        academic_year,
        total_income,
        total_expenses,
        balance: round2(total_income - total_expenses),
      };
    })
    .sort((a, b) => a.academic_year.localeCompare(b.academic_year));
}
