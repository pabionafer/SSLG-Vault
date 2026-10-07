"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import {
  Badge,
  EmptyState,
  ErrorNote,
  Pagination,
  Spinner,
  btnGhost,
  inputCls,
} from "@/components/ui";

interface Defaulter {
  student: {
    id: string | number;
    student_no: string;
    first_name: string;
    last_name: string;
    year_level: number;
  };
  fee_id: string | number;
  fee_name: string;
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: string;
  due_date: string;
  days_overdue: number;
}

interface Summary {
  as_of: string;
  count: number;
  students: number;
  total_balance: number;
  over_30_days: number;
  by_year_level: Record<string, number>;
  by_fee: Record<string, number>;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DefaultersPage() {
  const [rows, setRows] = useState<Defaulter[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [asOf, setAsOf] = useState(today());
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");
  const limit = 50;

  const filterParams = (() => {
    const p = new URLSearchParams();
    if (asOf) p.set("as_of", asOf);
    if (year) p.set("academic_year", year.trim());
    if (semester) p.set("semester", semester);
    return p;
  })();
  const exportHref = `/api/defaulters/export?${filterParams}`;
  const pdfHref = `/api/defaulters/pdf?${filterParams}`;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (asOf) params.set("as_of", asOf);
    if (year.trim()) params.set("academic_year", year.trim());
    if (semester) params.set("semester", semester);
    const res = await api<{ items: Defaulter[]; total: number }>(`/api/defaulters?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load defaulters");
    }
    setLoading(false);

    const sumParams = new URLSearchParams();
    if (asOf) sumParams.set("as_of", asOf);
    if (year.trim()) sumParams.set("academic_year", year.trim());
    if (semester) sumParams.set("semester", semester);
    const s = await api<Summary>(`/api/defaulters/summary?${sumParams}`);
    if (s.ok) setSummary(s.data);
  }, [page, asOf, year, semester]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Defaulters</h1>
          <p className="text-sm text-muted">
            Overdue balances as of {summary?.as_of ?? asOf}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={exportHref} className={btnGhost}>
            Export CSV
          </Link>
          <Link href={pdfHref} target="_blank" className={btnGhost}>
            Download PDF
          </Link>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Outstanding</div>
            <div className="mt-1 text-lg font-bold">{php(summary.total_balance)}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Defaulting students</div>
            <div className="mt-1 text-lg font-bold">{summary.students}</div>
            <div className="text-xs text-muted">{summary.count} overdue fee items</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Over 30 days</div>
            <div className="mt-1 text-lg font-bold">{summary.over_30_days}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">By year level</div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              {Object.entries(summary.by_year_level ?? {}).map(([lvl, amt]) => (
                <span key={lvl} className="rounded bg-tint px-1.5 py-0.5">
                  Y{lvl}: {php(Number(amt))}
                </span>
              ))}
              {Object.keys(summary.by_year_level ?? {}).length === 0 && (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">As of</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => {
              setPage(1);
              setAsOf(e.target.value);
            }}
            aria-label="As of date"
            className={inputCls}
          />
        </label>
        <input
          type="text"
          value={year}
          onChange={(e) => {
            setPage(1);
            setYear(e.target.value);
          }}
          placeholder="Academic year (e.g. 2025-2026)"
          aria-label="Academic year"
          className={`${inputCls} w-56`}
        />
        <select
          value={semester}
          onChange={(e) => {
            setPage(1);
            setSemester(e.target.value);
          }}
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

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Due date</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">Balance</th>
              <th className="px-3 py-2">Days overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState message="No defaulters for these filters. Nice." />
                </td>
              </tr>
            ) : (
              rows.map((d, i) => (
                <tr key={`${d.student.id}-${d.fee_id}-${i}`} className="hover:bg-tint/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/students/${d.student.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {d.student.last_name}, {d.student.first_name}
                    </Link>
                    <div className="font-mono text-xs text-muted">{d.student.student_no}</div>
                  </td>
                  <td className="px-3 py-2">{d.student.year_level}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/fees/${d.fee_id}`}
                      className="text-primary hover:underline"
                    >
                      {d.fee_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{d.due_date}</td>
                  <td className="px-3 py-2">{php(d.amount_due)}</td>
                  <td className="px-3 py-2">{php(d.amount_paid)}</td>
                  <td className="px-3 py-2 font-semibold">{php(d.balance)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={d.days_overdue > 30 ? "danger" : "warn"}>
                      {d.days_overdue}d
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={limit} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
