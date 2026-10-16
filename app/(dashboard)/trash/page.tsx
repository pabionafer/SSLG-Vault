"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, type GuardName } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  EmptyState,
  ErrorNote,
  Pagination,
  Spinner,
  btnPrimary,
} from "@/components/ui";

interface TrashRow {
  id: number | string;
  deleted_at: string | null;
  [key: string]: unknown;
}

interface EntityCfg {
  key: string;
  label: string;
  guard: GuardName;
  name: (r: TrashRow) => string;
  sub: (r: TrashRow) => string;
  amount?: (r: TrashRow) => number;
}

const ENTITIES: EntityCfg[] = [
  {
    key: "students",
    label: "Students",
    guard: "studentManager",
    name: (r) => `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
    sub: (r) => String(r.student_no ?? ""),
  },
  {
    key: "fees",
    label: "Fees",
    guard: "treasurer",
    name: (r) => String(r.name ?? ""),
    sub: (r) => `${r.semester ?? ""} ${r.academic_year ?? ""}`.trim(),
    amount: (r) => Number(r.amount ?? 0),
  },
  {
    key: "payments",
    label: "Payments",
    guard: "paymentRecorder",
    name: (r) => String(r.receipt_no ?? ""),
    sub: (r) => String(r.payment_date ?? ""),
    amount: (r) => Number(r.amount ?? 0),
  },
  {
    key: "collections",
    label: "Collections",
    guard: "treasurer",
    name: (r) => String(r.collection_date ?? ""),
    sub: (r) => `${r.semester ?? ""} ${r.academic_year ?? ""}`.trim(),
    amount: (r) => Number(r.total_amount ?? 0),
  },
  {
    key: "expenses",
    label: "Expenses",
    guard: "expenseManager",
    name: (r) => String(r.description ?? ""),
    sub: (r) => String(r.payee ?? ""),
    amount: (r) => Number(r.amount ?? 0),
  },
  {
    key: "igps",
    label: "IGP projects",
    guard: "igpEditor",
    name: (r) => String(r.name ?? ""),
    sub: (r) => String(r.custodian ?? ""),
  },
  {
    key: "income",
    label: "Income",
    guard: "igpEditor",
    name: (r) => String(r.description ?? ""),
    sub: (r) => String(r.income_date ?? ""),
    amount: (r) => Number(r.amount ?? 0),
  },
];

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TrashPage() {
  const { can } = useSession();
  const { push } = useToast();

  const visible = useMemo(() => ENTITIES.filter((e) => can(e.guard)), [can]);
  const [activeKey, setActiveKey] = useState("");
  const active = useMemo(
    () => visible.find((e) => e.key === activeKey) ?? visible[0],
    [visible, activeKey],
  );

  const [rows, setRows] = useState<TrashRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | number | null>(null);
  const [purging, setPurging] = useState<string | number | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    const res = await api<{ items: TrashRow[]; total: number }>(
      `/api/${active.key}?trash=true&page=${page}&limit=${limit}`,
    );
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError(`Could not load trashed ${active.label.toLowerCase()}`);
    }
    setLoading(false);
  }, [active, page]);

  useEffect(() => {
    const t = window.setTimeout(load, 100);
    return () => window.clearTimeout(t);
  }, [load]);

  async function restore(row: TrashRow) {
    if (!active) return;
    setRestoring(row.id);
    const res = await api(`/api/${active.key}/${row.id}/restore`, { method: "POST" });
    setRestoring(null);
    if (res.ok) {
      push("success", "Restored from Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not restore");
    }
  }

  async function schedulePurge(row: TrashRow) {
    setPurging(row.id);
    const res = await api(`/api/payments/${row.id}/schedule-purge`, { method: "POST" });
    setPurging(null);
    if (res.ok) {
      push("success", "Purge scheduled — hard delete in 7 days");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not schedule purge");
    }
  }

  if (visible.length === 0) {
    return <EmptyState message="Your role cannot access the Trash." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Trash</h1>
        <p className="text-sm text-muted">
          Soft-deleted records live here until they are restored or purged by the daily cleanup
          job.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {visible.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => {
              setActiveKey(e.key);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              active?.key === e.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">{active?.label ?? "Record"}</th>
              <th className="px-3 py-2">Detail</th>
              {active?.amount && <th className="px-3 py-2 text-right">Amount</th>}
              <th className="px-3 py-2">Deleted</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState message={`No trashed ${active?.label.toLowerCase() ?? "records"}.`} />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="hover:bg-tint/40">
                  <td className="px-3 py-2 font-semibold">{active ? active.name(r) : ""}</td>
                  <td className="px-3 py-2 text-muted">{active ? active.sub(r) : ""}</td>
                  {active?.amount && (
                    <td className="px-3 py-2 text-right">{php(active.amount(r))}</td>
                  )}
                  <td className="px-3 py-2">
                    {r.deleted_at ? new Date(r.deleted_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {active?.key === "payments" && can("admin") && (
                        <span className="text-xs text-muted">
                          {r.pending_hard_delete
                            ? "Purge scheduled"
                            : purging === r.id
                              ? "Scheduling…"
                              : r.deleted_at && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-danger px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-tint disabled:opacity-60"
                                    disabled={purging === r.id}
                                    onClick={() => schedulePurge(r)}
                                  >
                                    Schedule purge
                                  </button>
                                )}
                        </span>
                      )}
                      <button
                        type="button"
                        className={`${btnPrimary} px-3 py-1.5 text-xs`}
                        disabled={restoring === r.id}
                        onClick={() => restore(r)}
                      >
                        {restoring === r.id ? "Restoring…" : "Restore"}
                      </button>
                    </div>
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
