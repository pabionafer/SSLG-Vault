"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import {
  EmptyState,
  ErrorNote,
  Spinner,
  btnGhost,
  inputCls,
} from "@/components/ui";

interface Totals {
  total_payments: number;
  total_other_income: number;
  total_income: number;
  total_expenses: number;
  balance: number;
  counts: { payments: number; income: number; expenses: number };
  generated_at: string;
}

interface MonthRow {
  month: string;
  payments: number;
  income: number;
  expenses: number;
  net: number;
}

interface CategoryRow {
  category: string;
  total: number;
}

interface FeeRow {
  fee_id: number | string;
  name: string;
  amount: number;
  collected: number;
  balance: number;
  payments: number;
  academic_year: string;
  semester: string;
  progress: number;
}

interface ModeStats {
  count: number;
  total: number;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = "month" | "category" | "fee" | "mode";

export default function ReportsPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [tab, setTab] = useState<Tab>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");

  const [months, setMonths] = useState<MonthRow[]>([]);
  const [categories, setCategories] = useState<{ expenses: CategoryRow[]; income: CategoryRow[] }>({
    expenses: [],
    income: [],
  });
  const [fees, setFees] = useState<{ items: FeeRow[]; unassigned_total: number }>({
    items: [],
    unassigned_total: 0,
  });
  const [modes, setModes] = useState<{
    count: number;
    total: number;
    by_mode: Record<string, ModeStats>;
  } | null>(null);

  const baseParams = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (year.trim()) p.set("academic_year", year.trim());
    if (semester) p.set("semester", semester);
    return p;
  }, [from, to, year, semester]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = baseParams();
    const [t, m, c, f, md] = await Promise.all([
      api<Totals>(`/api/financial-report?${p}`),
      api<{ items: MonthRow[] }>(`/api/financial-report/by-month?${p}`),
      api<{ expenses: CategoryRow[]; income: CategoryRow[] }>(
        `/api/financial-report/by-category?${p}`,
      ),
      api<{ items: FeeRow[]; unassigned_total: number }>(`/api/financial-report/by-fee?${p}`),
      api<{ count: number; total: number; by_mode: Record<string, ModeStats> }>(
        `/api/financial-report/by-mode?${p}`,
      ),
    ]);
    if (t.ok) {
      setTotals(t.data);
      setError(null);
    } else if (t.status !== 401) {
      setError("Could not load report");
    }
    if (m.ok) setMonths(m.data.items ?? []);
    if (c.ok) setCategories(c.data);
    if (f.ok) setFees(f.data);
    if (md.ok) setModes(md.data);
    setLoading(false);
  }, [baseParams]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const exportHref = `/api/financial-report/export?${baseParams()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financial Report</h1>
          <p className="text-sm text-muted">
            {totals ? `Generated ${new Date(totals.generated_at).toLocaleString()}` : "…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={exportHref} className={btnGhost}>
            Export ledger CSV
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          className={`${inputCls} w-40`}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          className={`${inputCls} w-40`}
        />
        <input
          type="text"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Academic year (e.g. 2025-2026)"
          aria-label="Academic year"
          className={`${inputCls} w-56`}
        />
        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          aria-label="Semester"
          className={`${inputCls} w-44`}
        >
          <option value="">All semesters</option>
          <option value="1st Semester">1st Semester</option>
          <option value="2nd Semester">2nd Semester</option>
          <option value="Summer">Summer</option>
        </select>
      </div>

      {error && <ErrorNote message={error} />}

      {loading && !totals ? (
        <Spinner />
      ) : totals ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Collections", value: totals.total_payments },
            { label: "Other income", value: totals.total_other_income },
            { label: "Total income", value: totals.total_income },
            { label: "Expenses", value: totals.total_expenses },
            { label: "Balance", value: totals.balance },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs uppercase text-muted">{c.label}</div>
              <div
                className={`mt-1 text-lg font-bold ${
                  c.label === "Balance" && c.value < 0 ? "text-danger" : ""
                }`}
              >
                {php(c.value)}
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Entries</div>
            <div className="mt-1 text-lg font-bold">{totals.counts.payments}</div>
            <div className="text-xs text-muted">
              payments · {totals.counts.income} income · {totals.counts.expenses} expenses
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["month", "By month"],
            ["category", "By category"],
            ["fee", "By fee"],
            ["mode", "By mode"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {tab === "month" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Collections</th>
                <th className="px-3 py-2 text-right">Other income</th>
                <th className="px-3 py-2 text-right">Expenses</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {months.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState message="No activity in this period." />
                  </td>
                </tr>
              ) : (
                months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-3 py-2 font-semibold">{m.month}</td>
                    <td className="px-3 py-2 text-right">{php(m.payments)}</td>
                    <td className="px-3 py-2 text-right">{php(m.income)}</td>
                    <td className="px-3 py-2 text-right">{php(m.expenses)}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${m.net < 0 ? "text-danger" : ""}`}
                    >
                      {php(m.net)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "category" && (
          <div className="grid gap-0 md:grid-cols-2">
            <div className="border-b border-line md:border-b-0 md:border-r">
              <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase text-muted">
                Expenses by category
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {categories.expenses.length === 0 ? (
                    <tr>
                      <td>
                        <EmptyState message="No expenses." />
                      </td>
                    </tr>
                  ) : (
                    categories.expenses.map((c) => (
                      <tr key={c.category}>
                        <td className="px-3 py-2">{c.category}</td>
                        <td className="px-3 py-2 text-right font-semibold">{php(c.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase text-muted">
                Income by category
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {categories.income.length === 0 ? (
                    <tr>
                      <td>
                        <EmptyState message="No other income." />
                      </td>
                    </tr>
                  ) : (
                    categories.income.map((c) => (
                      <tr key={c.category}>
                        <td className="px-3 py-2">{c.category}</td>
                        <td className="px-3 py-2 text-right font-semibold">{php(c.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "fee" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Fee</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Collected</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fees.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No active fees." />
                  </td>
                </tr>
              ) : (
                fees.items.map((f) => (
                  <tr key={f.fee_id}>
                    <td className="px-3 py-2 font-semibold">{f.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {f.semester} {f.academic_year}
                    </td>
                    <td className="px-3 py-2 text-right">{php(f.amount)}</td>
                    <td className="px-3 py-2 text-right">{php(f.collected)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{php(f.balance)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-tint">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.min(100, f.progress)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted">{f.progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {fees.unassigned_total > 0 && (
              <tfoot>
                <tr className="border-t border-line text-sm">
                  <td colSpan={4} className="px-3 py-2 text-muted">
                    Payments not assigned to a fee
                  </td>
                  <td colSpan={2} className="px-3 py-2 text-right font-semibold">
                    {php(fees.unassigned_total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {tab === "mode" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Transactions</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {modes && Object.keys(modes.by_mode).length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState message="No payments in this period." />
                  </td>
                </tr>
              ) : (
                Object.entries(modes?.by_mode ?? {}).map(([m, v]) => (
                  <tr key={m}>
                    <td className="px-3 py-2 font-semibold capitalize">{m.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-right">{v.count}</td>
                    <td className="px-3 py-2 text-right font-semibold">{php(v.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {modes && (
              <tfoot>
                <tr className="border-t border-line text-sm">
                  <td className="px-3 py-2 font-semibold">Total</td>
                  <td className="px-3 py-2 text-right">{modes.count}</td>
                  <td className="px-3 py-2 text-right font-semibold">{php(modes.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
